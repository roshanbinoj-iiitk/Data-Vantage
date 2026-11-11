#!/usr/bin/env bash
# Builds the Linux release packages into dist/:
#   data-vantage_<version>_amd64.deb
#   Data-Vantage-<version>-x86_64.AppImage
#
# Build on the oldest system you want to support (CI uses Ubuntu 22.04): the
# packages need a glibc at least as new as the build machine's.
# Needs: cmake, g++, dpkg-dev, file, curl, Node.js 18+ and
# internet access (CMake fetches SQLite and header-only dependencies; linuxdeploy is
# downloaded on first use).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK:-$ROOT/build-packages}"
OUT="${OUT:-$ROOT/dist}"
ARCH="$(uname -m)"

mkdir -p "$WORK" "$OUT"
# Packages left over from an earlier run (maybe another version) would end up
# in SHA256SUMS and the release.
rm -rf "$WORK/cpack"
rm -f "$OUT"/*.deb "$OUT"/*.AppImage "$OUT/SHA256SUMS"

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
    -DDV_BUNDLED_SQLITE=ON \
    -DCMAKE_EXE_LINKER_FLAGS="-static-libstdc++ -static-libgcc"
cmake --build "$WORK/build" -j"$(nproc)"
if ldd "$WORK/build/data-vantage" | grep -q libsqlite3; then
    echo "data-vantage links the system SQLite; it must use the bundled one" >&2
    exit 1
fi
VERSION="$(sed -n 's/^set(CPACK_PACKAGE_VERSION "\(.*\)")$/\1/p' "$WORK/build/CPackConfig.cmake")"
echo "Version $VERSION"

echo "==> .deb"
(cd "$WORK/build" && cpack -G DEB -B "$WORK/cpack")
cp "$WORK"/cpack/data-vantage_*.deb "$OUT/"

echo "==> AppImage"
APPDIR="$WORK/AppDir"
rm -rf "$APPDIR"
DESTDIR="$APPDIR" cmake --install "$WORK/build"

# A fixed linuxdeploy release, checked by hash, so a new upstream build can't
# change or break a release. To update, pick a tag from
# https://github.com/linuxdeploy/linuxdeploy/releases and take the asset's
# sha256 from its release page (or `gh api .../releases/tags/<tag>`).
LINUXDEPLOY_TAG="1-alpha-20251107-1"
LINUXDEPLOY_SHA256="c20cd71e3a4e3b80c3483cef793cda3f4e990aca14014d23c544ca3ce1270b4d"
if [ "$ARCH" != "x86_64" ]; then
    echo "The AppImage build is set up for x86_64 only (linuxdeploy hash pinned for it)" >&2
    exit 1
fi
LINUXDEPLOY="$WORK/linuxdeploy-$LINUXDEPLOY_TAG-$ARCH.AppImage"
if ! echo "$LINUXDEPLOY_SHA256  $LINUXDEPLOY" | sha256sum -c --status 2>/dev/null; then
    curl -fsSL -o "$LINUXDEPLOY.part" \
        "https://github.com/linuxdeploy/linuxdeploy/releases/download/$LINUXDEPLOY_TAG/linuxdeploy-$ARCH.AppImage"
    echo "$LINUXDEPLOY_SHA256  $LINUXDEPLOY.part" | sha256sum -c -
    mv "$LINUXDEPLOY.part" "$LINUXDEPLOY"
    chmod +x "$LINUXDEPLOY"
fi

# appimagetool builds .DirIcon (the icon file managers and launchers show)
# only from a PNG or XPM at the top of the AppDir, never from the SVG.
install -m644 "$ROOT/packaging/linux/data-vantage.png" "$APPDIR/data-vantage.png"
install -m644 "$ROOT/packaging/linux/data-vantage.png" "$APPDIR/.DirIcon"

APPIMAGE="$OUT/Data-Vantage-$VERSION-$ARCH.AppImage"
# APPIMAGE_EXTRACT_AND_RUN: run linuxdeploy without FUSE (containers, CI).
(cd "$WORK" && APPIMAGE_EXTRACT_AND_RUN=1 \
    LINUXDEPLOY_OUTPUT_VERSION="$VERSION" \
    LDAI_OUTPUT="$APPIMAGE" \
    "$LINUXDEPLOY" --appdir "$APPDIR" \
        --executable "$APPDIR/usr/bin/data-vantage" \
        --desktop-file "$APPDIR/usr/share/applications/data-vantage.desktop" \
        --icon-file "$APPDIR/usr/share/icons/hicolor/256x256/apps/data-vantage.png" \
        --icon-file "$APPDIR/usr/share/icons/hicolor/scalable/apps/data-vantage.svg" \
        --custom-apprun "$ROOT/packaging/linux/AppRun" \
        --output appimage)

# Check the result: the icon made it in and the program starts.
CHECK="$WORK/appimage-check"
rm -rf "$CHECK" && mkdir -p "$CHECK"
(cd "$CHECK" && "$APPIMAGE" --appimage-extract >/dev/null)
for f in .DirIcon AppRun data-vantage.desktop usr/bin/data-vantage usr/share/data-vantage/web/index.html; do
    if [ ! -e "$CHECK/squashfs-root/$f" ]; then
        echo "AppImage is missing $f" >&2
        exit 1
    fi
done
file -L "$CHECK/squashfs-root/.DirIcon" | grep -q 'PNG image' || { echo ".DirIcon is not a PNG" >&2; exit 1; }
APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGE" --help >/dev/null

(cd "$OUT" && sha256sum ./*.deb ./*.AppImage > SHA256SUMS)
echo "==> Done"
ls -lh "$OUT"
