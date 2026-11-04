#!/bin/bash
# Builds the small ffmpeg the InkonabTV Mac app bundles (desktop/media.js turns Dolby / DTS
# sound into AAC): official FFmpeg 8.0 source, checked against its signature, LGPL only,
# just the parts the app uses, for Apple and Intel Macs in one file.
# Output: desktop/vendor/ffmpeg/mac/ffmpeg. Needs Xcode command line tools and gpg.
#   bash scripts/build-ffmpeg-mac.sh
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUTDIR=$ROOT/desktop/vendor/ffmpeg/mac
W=$(mktemp -d -t inkonabtv-ffmpeg)
V=8.0
cd "$W"
echo "Downloading FFmpeg $V source…"
curl -sSfL -o ffmpeg.tar.xz https://ffmpeg.org/releases/ffmpeg-$V.tar.xz
curl -sSfL -o ffmpeg.tar.xz.asc https://ffmpeg.org/releases/ffmpeg-$V.tar.xz.asc
export GNUPGHOME=$W/gnupg; mkdir -m 700 "$GNUPGHOME"
curl -sSfL https://ffmpeg.org/ffmpeg-devel.asc | gpg -q --import 2>/dev/null || true
gpg --verify ffmpeg.tar.xz.asc ffmpeg.tar.xz 2>&1 | grep -q "Good signature" || { echo "Signature check FAILED"; exit 1; }
echo "Signature OK"
tar -xf ffmpeg.tar.xz
SRC=$W/ffmpeg-$V

build() {
  ARCH=$1; mkdir -p "$W/obj-$ARCH"; cd "$W/obj-$ARCH"
  X=""; [ "$ARCH" = x86_64 ] && X="--enable-cross-compile --arch=x86_64 --target-os=darwin --disable-x86asm"
  "$SRC/configure" --prefix="$W/out-$ARCH" $X --cc="clang -arch $ARCH" \
    --extra-cflags="-mmacosx-version-min=12.0" --extra-ldflags="-arch $ARCH -mmacosx-version-min=12.0" \
    --pkg-config=false --disable-autodetect --enable-securetransport --enable-zlib \
    --disable-everything --disable-doc --disable-ffplay --disable-ffprobe --disable-debug --enable-small \
    --disable-avdevice --enable-static --disable-shared \
    --enable-protocol=http,https,tcp,tls,file,pipe,crypto,httpproxy \
    --enable-demuxer=mov,matroska,mpegts,avi,flv,hls,aac,ac3,eac3,dts,mp3,wav \
    --enable-muxer=mp4,mov \
    --enable-decoder=ac3,eac3,dca,truehd,mlp,aac,aac_latm,mp3,mp2,opus,vorbis,flac,pcm_s16le,pcm_s24le,pcm_s16be,pcm_bluray,pcm_dvd \
    --enable-encoder=aac \
    --enable-parser=h264,hevc,aac,aac_latm,ac3,dca,mpegaudio,opus,vorbis,flac,mpeg4video,mpegvideo,av1,vp9,mlp \
    --enable-bsf=aac_adtstoasc,extract_extradata,h264_mp4toannexb,hevc_mp4toannexb,vp9_superframe \
    --enable-filter=aresample,aformat,anull,abuffer,abuffersink,buffer,buffersink,null,format >/dev/null
  make -j8 >/dev/null 2>&1
  make install >/dev/null
  echo "Built for $ARCH"
}
echo "Building (a few minutes)…"
build arm64 &
build x86_64 &
wait
mkdir -p "$OUTDIR"
lipo -create "$W/out-arm64/bin/ffmpeg" "$W/out-x86_64/bin/ffmpeg" -output "$OUTDIR/ffmpeg"
cp "$SRC/COPYING.LGPLv2.1" "$OUTDIR/FFmpeg-LICENSE.txt"
rm -rf "$W"
lipo -info "$OUTDIR/ffmpeg"
echo "Done: $OUTDIR/ffmpeg ($(du -h "$OUTDIR/ffmpeg" | cut -f1))"
