package main

// Mac build, used to test the installer against a real TV from the Mac.

import (
	_ "embed"
	"os/exec"
)

const sdbName = "sdb"

//go:embed bin/darwin/sdb
var sdbBin []byte

//go:embed bin/InkonabTV.wgt
var wgtBin []byte

//go:embed bin/duids.txt
var duidList string

func hide(cmd *exec.Cmd) {}

func alert(msg string) {
	exec.Command("osascript", "-e", `display alert "InkonabTV TV installer" message `+quote(msg)).Run()
}

func quote(s string) string {
	b := []byte{'"'}
	for _, c := range []byte(s) {
		if c == '"' || c == '\\' {
			b = append(b, '\\')
		}
		b = append(b, c)
	}
	return string(append(b, '"'))
}
