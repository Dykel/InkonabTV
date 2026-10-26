#!/usr/bin/env bash
# Builds the OpenVPN 2 engine (from the official OpenVPN for Android sources, GPLv2) into
# android/app/src/main/jniLibs/<abi>/ as libopenvpn.so + libovpnexec.so.
#
#   git clone --depth 1 https://github.com/schwabe/ics-openvpn.git vendor/ics-openvpn
#   (cd vendor/ics-openvpn && git submodule update --init --depth 1 \
#      main/src/main/cpp/openvpn main/src/main/cpp/openssl main/src/main/cpp/lz4 main/src/main/cpp/fmt)
#   scripts/build-openvpn.sh
#
# Needs the Android SDK with "ndk;30.0.14904198" and "cmake;4.1.2" (sdkmanager).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
NDK="$SDK/ndk/30.0.14904198"
CMAKE_DIR="$SDK/cmake/4.1.2/bin"
SRC="$ROOT/vendor/ics-openvpn/main/src/main/cpp"
OUT="$ROOT/android/app/src/main/jniLibs"
ABIS="${ABIS:-arm64-v8a armeabi-v7a x86_64}"

for ABI in $ABIS; do
  # The "intermediates/cmake/…skeleton…/" path tells the upstream CMakeLists to skip OpenVPN 3.
  B="$ROOT/vendor/build/intermediates/cmake/skeleton/$ABI"
  "$CMAKE_DIR/cmake" -S "$SRC" -B "$B" -G Ninja \
    -DCMAKE_MAKE_PROGRAM="$CMAKE_DIR/ninja" \
    -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" \
    -DANDROID_ABI="$ABI" -DANDROID_PLATFORM=android-23 \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DCMAKE_LIBRARY_OUTPUT_DIRECTORY="$B/lib/" \
    -DCMAKE_RUNTIME_OUTPUT_DIRECTORY="$B/lib/"
  "$CMAKE_DIR/cmake" --build "$B" --target openvpn libovpnexec.so
  mkdir -p "$OUT/$ABI"
  cp "$B/lib/libopenvpn.so" "$B/lib/libovpnexec.so" "$OUT/$ABI/"
  "$NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip" --strip-unneeded "$OUT/$ABI/"*.so
  echo "✓ $ABI"
done
