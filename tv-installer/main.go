// InkonabTV Samsung TV installer: installs the InkonabTV app on a Samsung TV in Developer mode,
// with nothing else to install. It carries Samsung's sdb tool and the signed InkonabTV.wgt and
// opens a step-by-step page in the browser (served on 127.0.0.1 only). Install does what Tizen
// Studio does: connect, read the TV's ID (DUID), copy the package to the TV's SDK temp folder,
// `0 vd_appinstall`, then `0 was_execute` to open it.
//
// The package only installs on TVs whose DUID is in the Samsung distributor certificate used to
// sign it (bin/duids.txt, written by scripts/build-tv-installer.sh). An unknown TV gets its DUID
// shown, to send to the developer, who adds it to the certificate and rebuilds.
//
// Build with scripts/build-tv-installer.sh (it fills bin/).
package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	pkgID = "InkonabTV1"
	appID = "InkonabTV1.InkonabTV"
	port  = "26101"
	// Help: the developer's Facebook page.
	helpName = "Dykel Away"
	helpURL  = "https://www.facebook.com/profile.php?id=61596171655758"
)

var version = "dev" // set at build time

type job struct {
	mu      sync.Mutex
	Running bool     `json:"running"`
	Done    bool     `json:"done"`
	OK      bool     `json:"ok"`
	Lines   []string `json:"lines"`
	Error   string   `json:"error"`
	DUID    string   `json:"duid"`
	Unknown bool     `json:"unknownTV"` // TV not in the certificate
}

func (j *job) log(format string, a ...any) {
	j.mu.Lock()
	j.Lines = append(j.Lines, fmt.Sprintf(format, a...))
	j.mu.Unlock()
}

func (j *job) finish(ok bool, errText string) {
	j.mu.Lock()
	j.Running, j.Done, j.OK, j.Error = false, true, ok, errText
	j.mu.Unlock()
}

var (
	sdb, wgt, cfgPath string
	allowed           map[string]bool
	cur               = &job{}
	curMu             sync.Mutex // guards swapping cur
	lastSeen          = time.Now()
	seenMu            sync.Mutex
)

func main() {
	dir, err := workDir()
	if err == nil {
		sdb, wgt, err = unpack(dir)
	}
	if err != nil {
		fatal("Can't prepare files: %v", err)
	}
	cfgPath = filepath.Join(dir, "settings.json")
	allowed = map[string]bool{}
	for _, d := range strings.Fields(duidList) {
		allowed[strings.ToUpper(d)] = true
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fatal("Can't start: %v", err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", page)
	mux.HandleFunc("/info", info)
	mux.HandleFunc("/install", install)
	mux.HandleFunc("/status", status)
	url := "http://" + ln.Addr().String() + "/"
	go http.Serve(ln, mux)
	if os.Getenv("INKONAB_NO_BROWSER") == "" { // set when testing
		openBrowser(url)
	}
	fmt.Println("InkonabTV TV installer is open in your browser:", url)

	// Quit a minute after the page is closed (it checks in every second).
	for {
		time.Sleep(10 * time.Second)
		seenMu.Lock()
		idle := time.Since(lastSeen)
		seenMu.Unlock()
		j := current()
		j.mu.Lock()
		running := j.Running
		j.mu.Unlock()
		if idle > time.Minute && !running {
			exec.Command(sdb, "kill-server").Run()
			os.Exit(0)
		}
	}
}

func current() *job {
	curMu.Lock()
	defer curMu.Unlock()
	return cur
}

func touch() {
	seenMu.Lock()
	lastSeen = time.Now()
	seenMu.Unlock()
}

func page(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	touch()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	fmt.Fprint(w, pageHTML)
}

func info(w http.ResponseWriter, r *http.Request) {
	touch()
	var cfg struct {
		TV string `json:"tv"`
	}
	if b, err := os.ReadFile(cfgPath); err == nil {
		json.Unmarshal(b, &cfg)
	}
	writeJSON(w, map[string]any{
		"version": version, "pcIP": localIP(), "lastTV": cfg.TV,
		"helpName": helpName, "helpURL": helpURL, "tvCount": len(allowed),
	})
}

func status(w http.ResponseWriter, r *http.Request) {
	touch()
	j := current()
	j.mu.Lock()
	b, _ := json.Marshal(j)
	j.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}

func install(w http.ResponseWriter, r *http.Request) {
	touch()
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	// The page is served from this same address; refuse requests from other sites.
	if o := r.Header.Get("Origin"); o != "" && o != "http://"+r.Host {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	tv := strings.TrimSpace(r.FormValue("tv"))
	if ip := net.ParseIP(tv); ip == nil || ip.To4() == nil {
		http.Error(w, "That doesn't look like an IP address (example: 192.168.1.25).", http.StatusBadRequest)
		return
	}
	curMu.Lock()
	old := cur
	old.mu.Lock()
	busy := old.Running
	old.mu.Unlock()
	if busy {
		curMu.Unlock()
		http.Error(w, "Already installing", http.StatusConflict)
		return
	}
	j := &job{Running: true}
	cur = j
	curMu.Unlock()
	if b, err := json.Marshal(map[string]string{"tv": tv}); err == nil {
		os.WriteFile(cfgPath, b, 0o644)
	}
	go runInstall(j, tv)
	writeJSON(w, map[string]bool{"started": true})
}

func runInstall(j *job, tv string) {
	target := tv + ":" + port
	pcIP := localIP()

	j.log("Connecting to the TV at %s…", tv)
	// A fresh sdb server: another one (Tizen Studio, an older installer) would drop the connection.
	sh("kill-server")
	sh("start-server")
	out, _ := sh("connect", target)
	if !strings.Contains(out, "connected") {
		// A stale connection from before a TV restart: drop it and try once more.
		sh("disconnect", target)
		time.Sleep(time.Second)
		out, _ = sh("connect", target)
	}
	if !strings.Contains(out, "connected") {
		j.finish(false, fmt.Sprintf("Couldn't connect to the TV at %s. Check that the TV is on and on the same network as this computer, "+
			"that Developer mode is ON with Host PC IP %s, and that the TV was restarted after changing it (steps 2 and 3).", tv, pcIP))
		return
	}
	j.log("Connected.")

	j.log("Reading the TV's ID…")
	duid := strings.ToUpper(strings.TrimSpace(lastLines(mustSh("-s", target, "shell", "0", "getduid"), 1)))
	if !regexp.MustCompile(`^[A-Z0-9]{10,20}$`).MatchString(duid) {
		duid = ""
	}
	j.mu.Lock()
	j.DUID = duid
	j.mu.Unlock()
	if duid != "" {
		j.log("TV ID (DUID): %s", duid)
	}
	if duid != "" && len(allowed) > 0 && !allowed[duid] {
		j.mu.Lock()
		j.Unknown = true
		j.mu.Unlock()
		sh("disconnect", target)
		j.finish(false, "This TV isn't registered for InkonabTV test installs yet.")
		return
	}

	tmp := capability(mustSh("-s", target, "capability"), "sdk_toolpath")
	if tmp == "" {
		tmp = "/home/owner/share/tmp/sdk_tools"
	}
	remote := tmp + "/tmp/InkonabTV.wgt"

	j.log("Copying InkonabTV %s to the TV…", version)
	if out, err := sh("-s", target, "push", wgt, remote); err != nil || strings.Contains(strings.ToLower(out), "error") {
		j.finish(false, "Couldn't copy the app to the TV: "+lastLines(out, 3))
		return
	}
	j.log("Installing (about 20 seconds)…")
	out = mustSh("-s", target, "shell", "0", "vd_appinstall", pkgID, remote)
	if !regexp.MustCompile(`install completed|installing\[100\]`).MatchString(out) {
		if regexp.MustCompile(`(?i)certificate|signature|author|privilege`).MatchString(out) {
			j.mu.Lock()
			j.Unknown = true
			j.mu.Unlock()
			j.finish(false, "The TV refused the app's Samsung certificate: this TV isn't registered yet.")
			return
		}
		j.finish(false, "The TV refused to install the app. TV said: "+lastLines(out, 4))
		return
	}
	j.log("Installed.")
	j.log("Opening InkonabTV on the TV…")
	sh("-s", target, "shell", "0", "was_execute", appID)
	sh("disconnect", target)
	j.finish(true, "")
}

// workDir: a per-user folder for the unpacked tools and the remembered TV address.
func workDir() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "InkonabTV-TV-Installer")
	return dir, os.MkdirAll(dir, 0o755)
}

func unpack(dir string) (sdbPath, wgtPath string, err error) {
	sdbPath = filepath.Join(dir, sdbName)
	if err = writeIfChanged(sdbPath, sdbBin, 0o755); err != nil {
		return
	}
	wgtPath = filepath.Join(dir, "InkonabTV.wgt")
	err = os.WriteFile(wgtPath, wgtBin, 0o644)
	return
}

func writeIfChanged(path string, data []byte, mode os.FileMode) error {
	if old, err := os.ReadFile(path); err == nil && string(old) == string(data) {
		return nil
	}
	// sdb may still be running from an earlier install (it keeps a background server).
	if err := os.WriteFile(path, data, mode); err != nil {
		exec.Command(path, "kill-server").Run()
		time.Sleep(time.Second)
		return os.WriteFile(path, data, mode)
	}
	return nil
}

// localIP: the address this computer uses on the local network (no packet is sent).
func localIP() string {
	c, err := net.Dial("udp", "192.0.2.1:9")
	if err != nil {
		return ""
	}
	defer c.Close()
	return c.LocalAddr().(*net.UDPAddr).IP.String()
}

func sh(args ...string) (string, error) {
	cmd := exec.Command(sdb, args...)
	hide(cmd)
	b, err := cmd.CombinedOutput()
	return string(b), err
}

func mustSh(args ...string) string { out, _ := sh(args...); return out }

func capability(out, key string) string {
	for _, l := range strings.Split(out, "\n") {
		if k, v, ok := strings.Cut(strings.TrimSpace(l), ":"); ok && k == key {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func lastLines(s string, n int) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	cmd.Start()
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func fatal(format string, a ...any) {
	msg := fmt.Sprintf(format, a...)
	fmt.Println("ERROR:", msg)
	alert(msg)
	os.Exit(1)
}
