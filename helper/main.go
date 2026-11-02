// InkonabTV Helper: a small local relay so the InkonabTV website can play plain-HTTP
// video on a computer, through the viewer's own internet connection.
//
// The website is HTTPS and browsers block plain-HTTP video inside it, but they allow a
// page to talk to a program on the same computer at http://127.0.0.1. The helper listens
// there (port 17788), fetches the stream and hands it back with CORS headers. HLS
// playlists are rewritten so every segment also goes through it.
//
// Safety: it only listens on 127.0.0.1 (other devices can't reach it), it only answers
// pages from the InkonabTV website, and it refuses addresses on the local network.
package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	version = "1.0.0"
	addr    = "127.0.0.1:17788"
)

// Pages allowed to use the helper.
var allowedOrigins = map[string]bool{
	"https://dykel.github.io":          true,
	"https://inkonabtv.alwaysdata.net": true,
	"http://localhost:8790":            true, // local development
	"http://127.0.0.1:8790":            true,
}

var client = &http.Client{
	Timeout: 0, // live streams run for hours
	Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           safeDial,
		ResponseHeaderTimeout: 20 * time.Second,
		IdleConnTimeout:       60 * time.Second,
		MaxIdleConnsPerHost:   8,
	},
}

// safeDial refuses loopback and private addresses, so a page can't use the helper to reach
// devices on the viewer's network.
func safeDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if ip.IP.IsLoopback() || ip.IP.IsPrivate() || ip.IP.IsLinkLocalUnicast() || ip.IP.IsUnspecified() {
			return nil, fmt.Errorf("address not allowed")
		}
	}
	d := net.Dialer{Timeout: 15 * time.Second}
	return d.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
}

// Players reload a live playlist every few seconds. Asking the provider's login address each
// time opens a new session, so the address it redirects to is reused for 10 minutes.
var (
	streamMu    sync.Mutex
	streamCache = map[string]cached{}
)

type cached struct {
	final string
	at    time.Time
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/", handle)
	srv := &http.Server{Addr: addr, Handler: mux}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Println("InkonabTV Helper is already running (or port 17788 is busy). You can close this window.")
		pause()
		return
	}
	fmt.Println("InkonabTV Helper " + version + " is running.")
	fmt.Println("Leave this window open (you can minimise it) and watch on the InkonabTV website.")
	fmt.Println("Close it, or press Ctrl+C, to stop.")

	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, os.Interrupt)
		<-c
		srv.Close()
	}()
	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		log.Println(err)
	}
}

func pause() {
	fmt.Println("Press Enter to close.")
	bufio.NewReader(os.Stdin).ReadString('\n')
}

func cors(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin != "" && !allowedOrigins[origin] {
		return false
	}
	h := w.Header()
	if origin != "" {
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Vary", "Origin")
	}
	h.Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Range, Content-Type")
	h.Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
	// Chrome asks before a public site talks to the local computer.
	h.Set("Access-Control-Allow-Private-Network", "true")
	return true
}

func handle(w http.ResponseWriter, r *http.Request) {
	if !cors(w, r) {
		http.Error(w, "Not allowed from this site", http.StatusForbidden)
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.URL.Path == "/ping" {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"app":"inkonabtv-helper","version":%q}`, version)
		return
	}
	target := r.URL.Query().Get("url")
	if target == "" {
		fmt.Fprintln(w, "InkonabTV Helper is running.")
		return
	}
	t, err := url.Parse(target)
	if err != nil || (t.Scheme != "http" && t.Scheme != "https") || t.Host == "" {
		http.Error(w, "Bad url", http.StatusBadRequest)
		return
	}
	if strings.HasSuffix(strings.ToLower(t.Path), ".m3u8") || strings.HasSuffix(strings.ToLower(t.Path), ".m3u") {
		playlist(w, r, target)
		return
	}
	stream(w, r, target)
}

func get(target string, rangeHdr string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (InkonabTV Helper)")
	if rangeHdr != "" {
		req.Header.Set("Range", rangeHdr)
	}
	return client.Do(req)
}

func fetchText(target string) (int, string, string, error) {
	resp, err := get(target, "")
	if err != nil {
		return 0, "", "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return resp.StatusCode, string(b), resp.Request.URL.String(), err
}

var uriAttr = regexp.MustCompile(`URI="([^"]+)"`)

func playlist(w http.ResponseWriter, r *http.Request, target string) {
	var code int
	var text, final string
	var err error

	streamMu.Lock()
	c, ok := streamCache[target]
	streamMu.Unlock()
	if ok && time.Since(c.at) < 10*time.Minute {
		code, text, final, err = fetchText(c.final)
	}
	if err != nil || code != http.StatusOK || !strings.HasPrefix(strings.TrimSpace(text), "#EXTM3U") {
		code, text, final, err = fetchText(target)
		if err == nil && code == http.StatusOK {
			streamMu.Lock()
			streamCache[target] = cached{final: final, at: time.Now()}
			streamMu.Unlock()
		}
	}
	if err != nil {
		http.Error(w, "Helper could not reach the stream: "+err.Error(), http.StatusBadGateway)
		return
	}
	if code != http.StatusOK || !strings.HasPrefix(strings.TrimSpace(text), "#EXTM3U") {
		streamMu.Lock()
		delete(streamCache, target)
		streamMu.Unlock()
		w.WriteHeader(code)
		io.WriteString(w, text)
		return
	}

	base, _ := url.Parse(final)
	wrap := func(u string) string {
		ref, err := url.Parse(u)
		if err != nil {
			return u
		}
		return "http://" + addr + "/?url=" + url.QueryEscape(base.ResolveReference(ref).String())
	}
	var out []string
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		l := strings.TrimSpace(line)
		switch {
		case l == "":
			out = append(out, line)
		case strings.HasPrefix(l, "#"):
			out = append(out, uriAttr.ReplaceAllStringFunc(l, func(m string) string {
				return `URI="` + wrap(uriAttr.FindStringSubmatch(m)[1]) + `"`
			}))
		default:
			out = append(out, wrap(l))
		}
	}
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-cache")
	io.WriteString(w, strings.Join(out, "\n"))
}

func stream(w http.ResponseWriter, r *http.Request, target string) {
	resp, err := get(target, r.Header.Get("Range"))
	if err != nil {
		http.Error(w, "Helper could not reach the stream: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	for _, h := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Cache-Control"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	if w.Header().Get("Content-Type") == "" && path.Ext(resp.Request.URL.Path) == ".ts" {
		w.Header().Set("Content-Type", "video/mp2t")
	}
	w.WriteHeader(resp.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	buf := make([]byte, 64<<10)
	fl, _ := w.(http.Flusher)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				return // the player closed the connection
			}
			if fl != nil {
				fl.Flush()
			}
		}
		if err != nil {
			return
		}
	}
}
