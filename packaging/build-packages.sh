#!/usr/bin/env bash
# Builds the Linux release packages into dist/:
#   data-vantage_<version>_amd64.deb
#   Data-Vantage-<version>-x86_64.AppImage
#
# Build on the oldest system you want to support (CI uses Ubuntu 22.04): the
# packages need a glibc at least as new as the build machine's.
# Needs: cmake, g++, libsqlite3-dev, dpkg-dev, file, curl, Node.js 18+ and
# internet access (CMake fetches header-only dependencies; linuxdeploy is
# downloaded on first use).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK:-$ROOT/build-packages}"
OUT="${OUT:-$ROOT/dist}"
ARCH="$(uname -m)"

mkdir -p "$WORK" "$OUT"

echo "==> Frontend"
(cd "$ROOT/frontend" && npm ci && VITE_API_BASE=/api npm run build)

echo "==> Backend"
# libstdc++ and libgcc are linked statically so the binary also runs on
# distributions whose libstdc++ is older than the build machine's.
cmake -S "$ROOT/backend" -B "$WORK/build" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/usr \
    -DENABLE_NATIVE_OPT=OFF \
    -DDV_BUILD_TESTS=OFF \
    -DDV_WEB_DIST="$ROOT/frontend/dist" \
    -DCMAKE_EXE_LINKER_FLAGS="-static-libstdc++ -static-libgcc"
cmake --build "$WORK/build" -j"$(nproc)"
VERSION="$(sed -n 's/^set(CPACK_PACKAGE_VERSION "\(.*\)")$/\1/p' "$WORK/build/CPackConfig.cmake")"
echo "Version $VERSION"

echo "==> .deb"
(cd "$WORK/build" && cpack -G DEB -B "$WORK/cpack")
cp "$WORK"/cpack/data-vantage_*.deb "$OUT/"

echo "==> AppImage"
APPDIR="$WORK/AppDir"
rm -rf "$APPDIR"
DESTDIR="$APPDIR" cmake --install "$WORK/build"

LINUXDEPLOY="$WORK/linuxdeploy-$ARCH.AppImage"
if [ ! -x "$LINUXDEPLOY" ]; then
    curl -fsSL -o "$LINUXDEPLOY" \
        "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-$ARCH.AppImage"
    chmod +x "$LINUXDEPLOY"
fi

# APPIMAGE_EXTRACT_AND_RUN: run linuxdeploy without FUSE (containers, CI).
(cd "$WORK" && APPIMAGE_EXTRACT_AND_RUN=1 \
    LINUXDEPLOY_OUTPUT_VERSION="$VERSION" \
    OUTPUT="$OUT/Data-Vantage-$VERSION-$ARCH.AppImage" \
    "$LINUXDEPLOY" --appdir "$APPDIR" \
        --executable "$APPDIR/usr/bin/data-vantage" \
        --desktop-file "$APPDIR/usr/share/applications/data-vantage.desktop" \
        --icon-file "$APPDIR/usr/share/icons/hicolor/scalable/apps/data-vantage.svg" \
        --custom-apprun "$ROOT/packaging/linux/AppRun" \
        --output appimage)

(cd "$OUT" && sha256sum ./*.deb ./*.AppImage > SHA256SUMS)
echo "==> Done"
ls -lh "$OUT"
