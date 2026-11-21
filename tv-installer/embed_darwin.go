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

func hide(cmd *exec.Cmd) {}
