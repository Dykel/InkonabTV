# InkonabTV Helper

A small local relay so the HTTPS website can play the provider's plain-HTTP video on a
computer, through the viewer's own connection (no server bandwidth). The website checks
for it at http://127.0.0.1:17788 and uses it automatically.

It listens only on 127.0.0.1, answers only the InkonabTV website (allowedOrigins), refuses
local-network addresses, and reuses a live stream's address for playlist refreshes.

Build (Go 1.22+), from this folder:

    GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o InkonabTV-Helper.exe .
    GOOS=darwin  GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o helper-arm64 .
    GOOS=darwin  GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o helper-amd64 .
    lipo -create -output "InkonabTV Helper" helper-arm64 helper-amd64 && codesign -s - -f "InkonabTV Helper"
    GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o inkonabtv-helper-linux .

Builds are unsigned: macOS asks to confirm with right-click → Open, Windows with
More info → Run anyway.
