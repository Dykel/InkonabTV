package main

import (
	_ "embed"
	"os/exec"
	"syscall"
	"unsafe"
)

const sdbName = "sdb.exe"

//go:embed bin/windows/sdb.exe
var sdbBin []byte

//go:embed bin/InkonabTV.wgt
var wgtBin []byte

// TV IDs (DUIDs) in the Samsung certificate the package is signed with.
//
//go:embed bin/duids.txt
var duidList string

// hide: sdb runs without flashing a console window of its own.
func hide(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

// alert: a Windows message box (the installer has no console window).
func alert(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	text, _ := syscall.UTF16PtrFromString(msg)
	title, _ := syscall.UTF16PtrFromString("InkonabTV TV installer")
	box.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x10)
}
