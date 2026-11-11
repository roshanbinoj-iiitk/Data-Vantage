# Data-Vantage

High-performance file scanner, duplicate detector, and disk space analyzer with a modern web interface.

## Demo

[![Watch the Data-Vantage Demo](https://img.youtube.com/vi/bVWta-AlIxc/maxresdefault.jpg)](https://www.youtube.com/watch?v=bVWta-AlIxc)

https://github.com/user-attachments/assets/50491539-efaa-495f-99dc-8faac79b61b0

Watch the Data-Vantage demo

The video walks through:

Starting a scan of a folder from the web UI and watching live progress
Browsing results with the file browser and the interactive pie chart
Finding duplicate groups and keeping one copy (the rest go to the Trash)
Checking file type statistics

## Architecture

```
data-vantage/
├── backend/          # C++ REST API server
│   ├── include/      # Header files
│   ├── src/          # Implementation files
│   ├── CMakeLists.txt
│   └── build.sh
├── frontend/         # React + TypeScript web client
│   ├── src/
│   │   ├── api/      # Backend API client
│   │   ├── components/  # UI components
│   │   ├── pages/    # Route pages
│   │   ├── lib/      # Utilities & theme
│   │   └── hooks/    # Custom React hooks
│   └── package.json
└── README.md
```

## Features

- **Fast Directory Scanning** — Recursive filesystem traversal optimized for speed (comparable to ncdu)
- **Duplicate Detection** — size-first grouping, then XXH3-128 hashing in a thread pool; copies are compared byte by byte before anything is deleted
- **Recoverable Deletes** — files go to the desktop Trash (freedesktop.org spec), never deleted permanently
- **SQLite Storage** — Persistent scan results with WAL mode for concurrent access
- **REST API** — JSON endpoints for scans, files, duplicates, and statistics
- **Real-time Progress** — Live scan progress polling from the frontend
- **File Browser** — Navigate scanned directories with breadcrumb navigation
- **Interactive Visualizations** — Dynamic pie chart with clickable folders for navigation (inspired by GNOME Baobab)
- **Dark/Light Theme** — Toggle between themes

## Install

Download a package from the [latest release](https://github.com/roshanbinoj-iiitk/Data-Vantage/releases/latest). They run on x86_64 distributions with glibc 2.35 or newer (Ubuntu 22.04+, Debian 12+, Fedora 36+ and similar).

**AppImage (any distribution):**

```bash
chmod +x Data-Vantage-*-x86_64.AppImage
./Data-Vantage-*-x86_64.AppImage
```

It starts the server and opens the web UI in your browser. Press Ctrl+C in the terminal to stop it. If you started it by double-clicking, the server keeps running in the background until you log out or end it with `pkill -x data-vantage`; starting it again just opens the running copy in your browser.

**Debian / Ubuntu (.deb):**

```bash
sudo apt install ./data-vantage_*_amd64.deb
```

Then start **Data Vantage** from the app menu, or run `data-vantage --open` in a terminal.

**Arch Linux:** `yay -S data-vantage` (see [Arch Linux (AUR)](#arch-linux-aur)).

## Prerequisites (building from source)

### Backend

- C++17 compiler (g++ 9+ or clang++ 10+)
- CMake 3.16+
- SQLite3 development headers
- Internet access on the first build (CMake downloads cpp-httplib, nlohmann/json and xxHash), or the system packages with `-DUSE_SYSTEM_HTTPLIB=ON -DUSE_SYSTEM_JSON=ON -DUSE_SYSTEM_XXHASH=ON`

```bash
# Ubuntu/Debian
sudo apt install build-essential cmake libsqlite3-dev

# Fedora
sudo dnf install gcc-c++ cmake sqlite-devel

# Arch
sudo pacman -S base-devel cmake sqlite
```

### Frontend

- Node.js 18+
- npm or yarn

## Quick Start

### Build Backend

```bash
cd backend
chmod +x build.sh
./build.sh Release
# Binary: build/data-vantage
```

### Start Backend Server

The server listens on `127.0.0.1:8000` by default (use `--port` to change it).

```bash
cd backend
./build/data-vantage --port 8000
```

### Start Frontend Dev Server

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

The frontend dev server proxies `/api` requests to the backend at `127.0.0.1:8000`, adding the backend's API token (see [Security](#security)).

### Tests

```bash
# C++ unit tests (Catch2 is downloaded by CMake)
cmake -S backend -B backend/build -DDV_BUILD_TESTS=ON && cmake --build backend/build -j
ctest --test-dir backend/build --output-on-failure

# Same, under AddressSanitizer or ThreadSanitizer
cmake -S backend -B build-asan -DDV_BUILD_TESTS=ON -DDV_SANITIZE=address   # or thread

# End-to-end API test against a real server (uses a temporary data dir)
backend/tests/test_api.sh backend/build/data-vantage

# Frontend
cd frontend && npm run lint && npm test
```

C++ formatting is defined in `backend/.clang-format`; `backend/.clang-tidy` holds the static-analysis checks.

## Security

Data-Vantage can move files to the trash, so the API is locked down:

- It listens on `127.0.0.1` only. Binding another address (`--host 0.0.0.0`) prints a warning.
- Every `/api` request (except `/api/health`) needs the `X-Data-Vantage-Token` header. The token is random per run; the backend injects it into the page it serves and writes it to `$XDG_RUNTIME_DIR/data-vantage/token` (mode 0600) for the Vite dev proxy.
- No CORS headers are sent, non-GET requests must be `application/json`, and requests whose `Host` header isn't the local server are rejected (DNS rebinding).
- Deletes take file ids, not paths. Before moving a file to the trash the backend checks it's still inside the scanned folder and still has the size and modification time recorded by the scan; "keep this copy" also compares every copy byte by byte with the kept file, and refuses unless the kept file is a member of the group.

## Arch Linux (AUR)

### Install

Before the install please install cpp-httplib using the following command:

```bash
yay -S cpp-httplib --mflags "--nocheck"
```

Use your preferred AUR helper (examples below):

```bash
paru -S data-vantage
# or
yay -S data-vantage
```

### Launch

Run the server (it serves the built web UI by default), then open the URL in your browser:

```bash
data-vantage
# Web UI: http://localhost:8000
```

Notes:

- Scan results are stored in `$XDG_DATA_HOME/data-vantage/data_vantage.db` (usually `~/.local/share/data-vantage/`); use `--db` for another location. Older versions put `data_vantage.db` in the working directory; it isn't migrated.
- Optional folder pickers: install `zenity` (GTK) or `kdialog` (KDE). `xdg-utils` lets the UI open files and show them in your file manager.
- You can override the bind host/port or web root:

```bash
data-vantage --host 127.0.0.1 --port 8000 --web-root /usr/share/data-vantage/web
```

## API Endpoints

All endpoints except `/api/health` need the `X-Data-Vantage-Token` header; POST/DELETE bodies are JSON.

| Method | Endpoint                                  | Description                                                              |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/health`                             | Health check                                                             |
| POST   | `/api/pick-directory`                     | Show a native folder picker                                              |
| POST   | `/api/scans`                              | Start a scan (`{"path", "exclusions"?, "minSize"?}`)                      |
| GET    | `/api/scans`                              | List all scans                                                           |
| GET    | `/api/scans/:id`                          | Get a scan                                                               |
| GET    | `/api/scans/:id/progress`                 | Scan progress                                                            |
| POST   | `/api/scans/:id/stop`                     | Stop a running scan (it is marked `cancelled`, nothing is saved)         |
| DELETE | `/api/scans/:id`                          | Delete a scan record (running scans are stopped first)                   |
| GET    | `/api/scans/:id/files`                    | List a folder: `?parentId=&sort=name\|size\|extension\|modified&order=&limit=&offset=` → `{total, items}` |
| GET    | `/api/scans/:id/files/:fileId`            | An entry and its ancestors (for breadcrumbs)                             |
| GET    | `/api/scans/:id/search`                   | Search names (`?q=`)                                                     |
| POST   | `/api/scans/:id/files/delete`             | Move files to the trash (`{"ids": [...]}`)                               |
| POST   | `/api/scans/:id/files/:fileId/open`       | Open with the default app                                                |
| POST   | `/api/scans/:id/files/:fileId/reveal`     | Show in the file manager                                                 |
| GET    | `/api/scans/:id/duplicates`               | Duplicate groups: `?sort=wasted\|size\|count\|name\|path&order=&q=&limit=&offset=` |
| POST   | `/api/scans/:id/duplicates/:groupId/keep` | Keep one copy, trash the rest (`{"keepId": id}`)                         |
| GET    | `/api/scans/:id/stats`                    | File type statistics                                                     |

## Technology Stack

- **Backend**: C++17, cpp-httplib, nlohmann/json, SQLite3 (FTS5 trigram search), xxHash (XXH3-128)
- **Frontend**: React 18, TypeScript, Vite, TanStack Query, Tailwind CSS, Nivo Charts, Framer Motion
- **Desktop** (optional): Tauri

## How It Works

1. User enters a directory path in the web UI
2. Backend walks the directory tree (iteratively, skipping excluded folders such as `node_modules` and `.git`), collecting file metadata
3. Files are grouped by their real size (`st_size`), then hashed in parallel (quick hash → full XXH3-128 hash) to find duplicates
4. Results are stored in SQLite and returned via REST API
5. Frontend displays results with interactive tables, charts, and navigation

### Size on Disk

Storage sizes (`sizeOnDisk` in the API, `totalSize` and `wastedSpace` in scan
results) reflect **actual disk consumption**, `st_blocks * 512`. The apparent
size (`size`, from `st_size`) is stored as well and is what duplicate detection
groups by, since sparse or compressed files can use different amounts of disk
for the same content. Folder sizes and scan totals are updated when files are
deleted from the UI.

## Performance

- Iterative directory walk (`opendir`/`readdir` + `lstat`), so deep trees can't overflow the stack
- Exclusions are applied during the walk, so `node_modules`, `.git` and similar trees are never read
- Size-first grouping, then a quick hash (first + last 4 KiB), then a full XXH3-128 hash, spread over a thread pool
- SQLite in WAL mode; each bulk write is one transaction with statements prepared once
- Files are stored as name + parent id (paths are rebuilt on demand), with a `(scan_id, parent_id)` index for folder listings and an FTS5 trigram index for search
- The frontend pages large folders from the server and virtualizes long lists; three.js loads only on the landing page
