# Data-Vantage

High-performance file scanner, duplicate detector, and disk space analyzer with a modern web interface.

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
- **Duplicate Detection** — xxHash-based file hashing with size-first grouping for minimal I/O
- **SQLite Storage** — Persistent scan results with WAL mode for concurrent access
- **REST API** — JSON endpoints for scans, files, duplicates, and statistics
- **Real-time Progress** — Live scan progress polling from the frontend
- **File Browser** — Navigate scanned directories with breadcrumb navigation
- **Visualizations** — Pie charts for file type distribution
- **Dark/Light Theme** — Toggle between themes

## Prerequisites

### Backend

- C++17 compiler (g++ 9+ or clang++ 10+)
- CMake 3.16+
- SQLite3 development headers

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

By default the server binds to port 8000 in these instructions, but you can override it with `--port`.

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

The frontend dev server proxies `/api` requests to the backend at `localhost:8080`.

## API Endpoints

| Method | Endpoint                    | Description                                |
| ------ | --------------------------- | ------------------------------------------ |
| GET    | `/api/health`               | Health check                               |
| POST   | `/api/scans`                | Start a new scan (`{"path": "/dir"}`)      |
| GET    | `/api/scans`                | List all scans                             |
| GET    | `/api/scans/:id`            | Get scan result                            |
| GET    | `/api/scans/:id/progress`   | Get scan progress                          |
| POST   | `/api/scans/:id/stop`       | Stop active scan                           |
| DELETE | `/api/scans/:id`            | Delete scan                                |
| GET    | `/api/scans/:id/files`      | Browse files (`?parentId=&limit=&offset=`) |
| GET    | `/api/scans/:id/search`     | Search files (`?q=`)                       |
| GET    | `/api/scans/:id/duplicates` | Get duplicate groups (`?limit=&offset=`)   |
| GET    | `/api/scans/:id/stats`      | File type statistics                       |

## Technology Stack

- **Backend**: C++17, cpp-httplib, SQLite3, xxHash (embedded)
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts
- **Desktop** (optional): Tauri

## How It Works

1. User enters a directory path in the web UI
2. Backend scans the directory tree recursively, collecting file metadata
3. Files are grouped by size, then hashed (quick hash → full hash) to find duplicates
4. Results are stored in SQLite and returned via REST API
5. Frontend displays results with interactive tables, charts, and navigation

## Performance

- Uses `std::filesystem` with `skip_permission_denied` for robust traversal
- xxHash64 for O(1) hash comparison speed
- Size-first grouping minimizes unnecessary file reads
- Quick hash (first+last 4KB) reduces full hash operations
- SQLite WAL mode with batch inserts for fast DB writes
- Multi-threaded scanning with atomic progress counters
