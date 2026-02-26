#!/bin/bash
set -e

echo "============================================"
echo "  Data-Vantage Backend Build Script"
echo "============================================"

BUILD_TYPE="${1:-Release}"
BUILD_DIR="build"

echo "Build type: $BUILD_TYPE"

# Check dependencies
echo "Checking dependencies..."

if ! command -v cmake &> /dev/null; then
    echo "ERROR: cmake not found. Install with: sudo apt install cmake"
    exit 1
fi

if ! command -v g++ &> /dev/null && ! command -v clang++ &> /dev/null; then
    echo "ERROR: C++ compiler not found. Install with: sudo apt install g++"
    exit 1
fi

# Check for SQLite3 dev headers
if ! pkg-config --exists sqlite3 2>/dev/null; then
    if [ ! -f /usr/include/sqlite3.h ]; then
        echo "WARNING: sqlite3 dev headers may not be installed."
        echo "Install with: sudo apt install libsqlite3-dev"
    fi
fi

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure
echo "Configuring..."
cmake -DCMAKE_BUILD_TYPE="$BUILD_TYPE" ..

# Build
echo "Building..."
cmake --build . -j$(nproc)

echo ""
echo "============================================"
echo "  Build complete!"
echo "  Binary: $BUILD_DIR/data-vantage"
echo "  Run: ./$BUILD_DIR/data-vantage --port 8080"
echo "============================================"
