package main

import (
	_ "embed"
	"os/exec"
	"syscall"
)

const sdbName = "sdb.exe"

//go:embed bin/windows/sdb.exe
var sdbBin []byte

//go:embed bin/InkonabTV.wgt
var wgtBin []byte

// hide: sdb runs without flashing a console window of its own.
func hide(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
