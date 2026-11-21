// InkonabTV Samsung TV installer: installs the InkonabTV app on a Samsung TV in Developer mode,
// with nothing else to install. It carries Samsung's sdb tool and the signed InkonabTV.wgt, asks
// for the TV's IP address, and does what Tizen Studio does: connect, copy the package to the TV's
// SDK temp folder, `0 vd_appinstall`, then `0 was_execute` to open it.
//
// Build with scripts/build-tv-installer.sh (it fills bin/).
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const (
	pkgID = "InkonabTV1"
	appID = "InkonabTV1.InkonabTV"
	port  = "26101"
)

var version = "dev" // set at build time

type saved struct {
	TV string `json:"tv"`
}

func main() {
	code := run()
	if runtime.GOOS == "windows" {
		fmt.Print("\nPress Enter to close...")
		bufio.NewReader(os.Stdin).ReadString('\n')
	}
	os.Exit(code)
}

func run() int {
	fmt.Printf("InkonabTV for Samsung TV - installer %s\n", version)
	fmt.Println(strings.Repeat("=", 48))

	dir, err := workDir()
	if err != nil {
		return fail("Can't prepare files: %v", err)
	}
	sdb, wgt, err := unpack(dir)
	if err != nil {
		return fail("Can't prepare files: %v", err)
	}

	pcIP := localIP()
	fmt.Println()
	fmt.Println("On the TV (one time): open Apps, press 1 2 3 4 5 on the remote,")
	fmt.Println("turn Developer mode ON and enter this computer's IP address:")
	fmt.Printf("\n      %s\n\n", pcIP)
	fmt.Println("Then restart the TV (hold Power until it reboots).")
	fmt.Println()

	cfgPath := filepath.Join(dir, "settings.json")
	var cfg saved
	if b, err := os.ReadFile(cfgPath); err == nil {
		json.Unmarshal(b, &cfg)
	}
	tv := askIP(cfg.TV)
	if tv == "" {
		return fail("No TV IP address entered.")
	}
	cfg.TV = tv
	if b, err := json.Marshal(cfg); err == nil {
		os.WriteFile(cfgPath, b, 0o644)
	}
	target := tv + ":" + port

	fmt.Printf("\n1/4 Connecting to the TV at %s...\n", tv)
	sh(sdb, "start-server")
	out, _ := sh(sdb, "connect", target)
	if !strings.Contains(out, "connected") {
		// A stale connection from before a TV restart: drop it and try once more.
		sh(sdb, "disconnect", target)
		time.Sleep(time.Second)
		out, _ = sh(sdb, "connect", target)
	}
	if !strings.Contains(out, "connected") {
		return fail("Couldn't connect to the TV at %s.\n\n"+
			"Check that:\n"+
			"  - the TV is on and on the same network as this computer;\n"+
			"  - Developer mode is ON with Host PC IP = %s (Apps, then 1 2 3 4 5);\n"+
			"  - the TV was restarted after changing Developer mode.\n\n"+
			"(sdb said: %s)", tv, pcIP, strings.TrimSpace(out))
	}

	fmt.Println("2/4 Preparing the TV...")
	caps, _ := sh(sdb, "-s", target, "capability")
	tmp := capability(caps, "sdk_toolpath")
	if tmp == "" {
		tmp = "/home/owner/share/tmp/sdk_tools"
	}
	remote := tmp + "/tmp/InkonabTV.wgt"

	fmt.Println("3/4 Copying and installing InkonabTV (this takes about 20 seconds)...")
	if out, err := sh(sdb, "-s", target, "push", wgt, remote); err != nil || strings.Contains(strings.ToLower(out), "error") {
		return fail("Couldn't copy the app to the TV.\n(sdb said: %s)", strings.TrimSpace(out))
	}
	out, _ = sh(sdb, "-s", target, "shell", "0", "vd_appinstall", pkgID, remote)
	if !regexp.MustCompile(`install completed|installing\[100\]`).MatchString(out) {
		hint := ""
		if regexp.MustCompile(`(?i)certificate|signature|author`).MatchString(out) {
			hint = "\nThis TV isn't in the app's Samsung certificate. Ask for a build made for this TV."
		}
		return fail("The TV refused to install the app.%s\n(TV said: %s)", hint, lastLines(out, 6))
	}

	fmt.Println("4/4 Opening InkonabTV on the TV...")
	sh(sdb, "-s", target, "shell", "0", "was_execute", appID)
	sh(sdb, "disconnect", target)

	fmt.Println("\nDone! InkonabTV is installed and open on the TV.")
	return 0
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

func unpack(dir string) (sdb, wgt string, err error) {
	sdb = filepath.Join(dir, sdbName)
	if err = writeIfChanged(sdb, sdbBin, 0o755); err != nil {
		return
	}
	wgt = filepath.Join(dir, "InkonabTV.wgt")
	err = os.WriteFile(wgt, wgtBin, 0o644)
	return
}

func writeIfChanged(path string, data []byte, mode os.FileMode) error {
	if old, err := os.ReadFile(path); err == nil && len(old) == len(data) && string(old) == string(data) {
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

func askIP(last string) string {
	in := bufio.NewReader(os.Stdin)
	for {
		if last != "" {
			fmt.Printf("TV IP address [%s]: ", last)
		} else {
			fmt.Print("TV IP address (TV: Settings > General > Network > Network Status > IP Settings): ")
		}
		line, err := in.ReadString('\n')
		line = strings.TrimSpace(line)
		if line == "" {
			if last != "" {
				return last
			}
			if err != nil {
				return ""
			}
			continue
		}
		if ip := net.ParseIP(line); ip != nil && ip.To4() != nil {
			return line
		}
		fmt.Println("  That doesn't look like an IP address (example: 192.168.1.25).")
	}
}

// localIP: the address this computer uses on the local network (no packet is sent).
func localIP() string {
	c, err := net.Dial("udp", "192.0.2.1:9")
	if err != nil {
		return "(couldn't find it: see your network settings)"
	}
	defer c.Close()
	return c.LocalAddr().(*net.UDPAddr).IP.String()
}

func sh(bin string, args ...string) (string, error) {
	cmd := exec.Command(bin, args...)
	hide(cmd)
	b, err := cmd.CombinedOutput()
	return string(b), err
}

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

func fail(format string, a ...any) int {
	fmt.Printf("\nERROR: "+format+"\n", a...)
	return 1
}
