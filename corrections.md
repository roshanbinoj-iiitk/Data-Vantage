# Corrections & Improvements

Code review findings for Data-Vantage, ordered by how much damage each problem could do.

## 1. Security and data-loss risks (fix first)

### 1.1 Any website you visit can delete your files
- The server listens on `0.0.0.0` with `Access-Control-Allow-Origin: *` and has no authentication (`backend/src/api_server.cpp` CORS pre-routing handler, `backend/src/main.cpp` default host).
- Handlers read `req.body` whatever its `Content-Type`, so a page can send a `text/plain` POST that skips the CORS preflight.
- Any page open in the browser could call `POST /api/scans {"path":"/home/you"}` followed by `POST /api/scans/:id/files/delete`.
- Anyone on the same network can do the same, because the server listens on every interface.
- `/api/pick-directory` also lets a remote request open dialogs on the desktop.

**Fix:**
- [ ] Bind to `127.0.0.1` by default.
- [ ] Remove the `*` CORS rule, or allow only the frontend's own origin.
- [ ] Reject requests whose `Content-Type` isn't `application/json`.
- [ ] Generate a random token at startup; the served frontend receives it and must send it back with every request.

### 1.2 "Delete group" can delete every copy
- In the `delete-group` handler, every file whose path is `!= keep_path` is deleted.
- If `keepPath` doesn't exactly match a file in the group (typo, different encoding, or the JSON parsing problem in 1.3), **every copy is deleted** and nothing is kept.

**Fix:**
- [ ] Return 400 unless `keepPath` is actually a member of the group.

### 1.3 The hand-written JSON parser mangles paths
- `json::extract_string` and `json::extract_string_array` don't handle escaped characters.
- A filename containing `"`, `\` or `]` gets cut short or split, and these values feed directly into delete operations.

**Fix:**
- [ ] Replace the parser with [nlohmann/json](https://github.com/nlohmann/json), pulled in through FetchContent like `httplib`. It would also replace about 200 lines of string concatenation used to build responses.

### 1.4 Files are deleted based on stale scan data
- Nothing checks that a file is unchanged before it's removed. If a file changed after the scan, a "duplicate" that's no longer identical still gets deleted.
- `Hasher::sha256_file` (`backend/src/hasher.cpp`) just calls xxHash, so its name is misleading.

**Fix:**
- [ ] Re-check size and modification time, or re-hash, right before deleting.
- [ ] Ideally, compare files byte by byte before reporting them as duplicates.
- [ ] Rename `sha256_file` or implement real SHA-256.

### 1.5 Move files to the trash instead of deleting them permanently
- `fs::remove` deletes permanently.

**Fix:**
- [ ] Move files to the freedesktop trash (`~/.local/share/Trash`, via `gio trash` or by writing the trash files directly) so mistakes can be recovered.

## 2. Correctness bugs

| Issue | Where |
|---|---|
| **Stop doesn't fully stop.** It halts the directory walk, but hashing still runs and the partial scan is saved as `"completed"`. | `api_server.cpp`, scan thread |
| **Memory leak.** `active_scans` only loses an entry when the scan is deleted, so each finished scan keeps its whole file list (`Scanner::m_files`) in RAM until then. | `api_server.cpp`, scan thread |
| **Detached threads capture `this`.** Shutting down mid-scan can make them use memory that's already freed. Join them on shutdown, or cancel them. | `api_server.cpp`, scan thread |
| **Deleting a running scan** removes it from the map, but its thread keeps writing that scan's rows into the DB. | `DELETE /api/scans/:id` |
| **Duplicates are grouped by disk usage (`st_blocks*512`), not real file size.** This hashes unrelated files needlessly and inflates "wasted space" for sparse or compressed files. Store both sizes and group by `st_size`. | `scanner.cpp` |
| **Weak full-file hash.** Chunk hashes are combined with XOR and addition, which isn't a proper streaming hash. Use xxHash's real streaming API (XXH3_128 is a good choice). | `hasher.cpp`, `Hasher::hash_file` |
| **Transactions aren't rolled back on error.** If anything inside `BEGIN … COMMIT` throws, the connection stays stuck in the transaction. Return codes from `sqlite3_prepare_v2`/`sqlite3_step` are never checked. Add an RAII transaction guard and check every result. | `database.cpp` |
| **Exclusion lists live only in memory** (`scan_exclusions`), so they're lost when the server restarts. | `api_server.cpp` |
| **Folder sizes aren't updated after deletions**, so folder views and scan totals show stale numbers. | `Database::delete_files_by_paths` |
| **Bad `limit`/`offset`/`parentId` values make `stoi`/`stoll` throw**, returning an unhelpful 500 error. | file and duplicate endpoints |
| **Search doesn't escape `%`/`_`**, so those characters act as wildcards. | `Database::search_files` |

## 3. Performance

- [ ] **Add a composite index.** Queries filter on `scan_id AND parent_id`, but the index covers only `parent_id`. Add `CREATE INDEX ... ON files(scan_id, parent_id)`. On large scans this is the biggest easy speed-up.
- [ ] **Parallelize hashing.** Hash each size group in a thread pool; that's where most of the time goes on SSDs.
- [ ] **Prepare SQL statements once.** `store_duplicates` prepares statements inside loops, and `get_duplicates` runs one extra query per group. Prepare each statement once and fetch group members with a single JOIN.
- [ ] **Avoid opening every extensionless file** in `is_binary_file`. Make the check opt-in, or run it only on files that are already in a size group.
- [ ] **Use `std::unordered_set` instead of `std::set`** for visited inodes. The scanner is single-threaded, so its mutexes add cost without protecting anything.
- [ ] **Remove deep recursion** in `Scanner::scan_recursive`. Very deep directory trees could overflow the stack; use an explicit stack or queue.
- [ ] **Store name + `parent_id` instead of full paths** on every row to shrink the DB a lot.
- [ ] **Use FTS5 (or a trigram index) for search** instead of `LIKE '%q%'`, which reads the whole table.
- [ ] *(Optional)* Replace the 500 ms progress polling with Server-Sent Events.
- [ ] **Shrink the frontend bundle.** It ships three.js, drei, nivo, recharts and framer-motion. Lazy-load `HardDiskBackground` and standardise on one chart library.

## 4. Structure and tooling

- [ ] **Split `api_server.cpp`** (about 1,300 lines) into route handlers, a `ScanJob` class (walk → hash → store), JSON serialization, and the exclusion matcher.
- [ ] **Remove duplicated delete logic.** Both delete endpoints repeat the same steps (canonicalize the path, check it's inside the root, remove, build JSON); pull them into one helper.
- [ ] **Move the database to `$XDG_DATA_HOME/data-vantage/`.** It's currently created as `data_vantage.db` in whatever directory the server starts from, which matters especially for the AUR install.
- [ ] **Apply exclusions during the walk**, not only during duplicate detection. Skipping `node_modules`, `.git` and similar folders would speed up scans a lot.
- [ ] **Add an ESLint config.** `npm run lint` can't work without one. Add clang-format and clang-tidy for the C++ too.
- [ ] **Tests:**
  - Add C++ unit tests (Catch2 or GoogleTest) for the hasher, the exclusion matcher and the DB layer; the current tests are bash scripts that call the API with curl.
  - Add a GitHub Actions workflow that builds both halves and runs the tests.
  - Build with `-Wall -Wextra` and run the tests under AddressSanitizer and ThreadSanitizer; they would catch the threading problems in section 2.
- [ ] **Repo hygiene:**
  - `aur/data-vantage/data-vantage-1.0.0.tar.gz` is a build artifact committed to git, and the AUR files are duplicated (`aur/` and `aur/data-vantage/`).
  - `.gitignore` is mostly a Python template; trim it to what this project needs.
  - The PKGBUILD says `license=('Apache')`. Check that it matches `LICENSE` and use the SPDX name (e.g. `Apache-2.0`).

## 5. Feature ideas

- Incremental re-scan: skip hashing files whose size and modification time haven't changed since the last scan.
- Replace duplicates with hard links or reflinks (`cp --reflink`) instead of deleting them.
- Bulk "keep the oldest / newest / shortest path" rules for duplicate groups.
- Compare two scans to see what grew.
- A list of the largest files, and a filter for old files.
- Export results to CSV or JSON.
- Similar-image detection with perceptual hashing.

## 6. Frontend

The UI looks polished and the code is consistent, but some screens show wrong numbers or silently drop data.

### 6.1 Bugs that show wrong data

- [ ] **Folders with more than 100 entries are cut short.** `FolderView` calls `getFiles(scanId, parentId)` with the default `limit = 100` and never fetches more pages.
  - Only the first 100 entries appear (directories first, then by name); the rest are missing.
  - Sorting the table by size only reorders those 100 entries, so the biggest files may not appear at all.
  - The sunburst chart and the "Files (N)" count are also based on just those 100 entries.
- [ ] **The Duplicates page totals cover only the current page.**
  - "Wasted Space" and "Duplicate Files" are summed from the 20 groups on screen (`groups.reduce(...)`), while "Duplicate Groups" shows the real total, so the three cards disagree.
  - Sorting and the filter box only work within the current 20 groups, so sorting by "Wasted" doesn't find the worst groups across the whole scan.
  - **Fix:** show `scan.wastedSpace` / `scan.duplicateFiles`, and do sorting and filtering on the server.
- [ ] **Scan progress disappears when you leave the Dashboard.** `activeScanId` lives in `useScan` state inside `Dashboard`. Going to Files during a scan and coming back loses the progress card while the scan keeps running.
  - **Fix:** move the hook into a context, or on mount check for scans with status `running` and resume them.
- [ ] **Hooks are called after an early return** in `components/FolderSunburst.tsx`. `React.useRef` / `useState` run after `if (chartData.length === 0) return …`, which breaks React's rule that hooks always run in the same order.
  - It's hidden today because the component remounts on every load. Any change that keeps it mounted while data goes from empty to non-empty would crash with "Rendered more hooks than during the previous render".
- [ ] **Fast clicking can show the wrong folder.** `loadFiles` never cancels the previous request, so a slow earlier response can arrive last and overwrite the folder you actually opened.
  - Progress polling has a similar issue: `setInterval(poll, 500)` (`hooks/use-scan.ts`) starts a new request even if the previous one hasn't finished.
- [ ] **Navigating into a folder from search results builds a wrong breadcrumb path.** `handleDirectoryClick` appends to the old breadcrumbs, so the trail no longer matches where you are.

### 6.2 UX problems

- [ ] **Folder location isn't in the URL.** Refreshing, the browser back button, or sharing a link always returns to the scan's root folder. Put the directory in the URL, e.g. `/files/:scanId/:dirId`.
- [ ] **Deleting a scan (×) on the Dashboard has no confirmation and no error handling**, unlike file deletes.
- [ ] **"Keep this file" doesn't list what will be deleted.** The confirmation shows only a count; for a permanent delete it should list every path that will be removed.
- [ ] **"Go to Dashboard" goes to the landing page.** It navigates to `/` instead of `/dashboard` on both the Files and Duplicates pages.
- [ ] **Messages that don't fit the user.** Error messages mention macOS and port 8000 regardless of platform or setup, and the directory picker falls back to `window.prompt`.
- [ ] **The minimum-size slider is hard to use.** It's linear from 0 to 10 MB in 1 KB steps, so small values are nearly impossible to pick. Use preset steps or a log scale.
- [ ] **Light/dark mode problems.** The landing hero title uses `text-white` (invisible in light mode), and the "Choose" button is hard-coded to `bg-gray-100` (out of place in dark mode).
- [ ] **Mobile layout.** The sidebar is open by default and drawn over the content.
- [ ] **File rows do nothing when clicked.** Opening the file or revealing it in the file manager would be useful.
- [ ] **The landing page footer says "© All rights reserved"**, which contradicts the open-source license.

### 6.3 Performance

- [ ] **The landing page is heavy.** It renders a full three.js scene with 2048px shadow maps, constant auto-rotation and `<Environment preset="studio">`, which downloads an HDR image from a CDN (so the page needs internet access, odd for a local tool).
  - **Fix:** lazy-load it, replace it with a static image, or at least respect `prefers-reduced-motion`.
- [ ] **`recharts` is installed but never used.** Only `@nivo/pie` is imported; remove it from `package.json`.
- [ ] **`FileTable` re-sorts on every render** without `useMemo`, and large lists aren't virtualized.

### 6.4 Code quality

- [ ] **Data fetching is hand-written in every page** (`useEffect` + `useState` + `.catch(console.error)`). TanStack Query would provide caching, request cancellation, refetching and loading/error states, and would fix the progress and fast-clicking bugs in 6.1.
- [ ] **Remove copy-pasted code:**
  - Stat cards are repeated 7 times → extract a `StatCard` component.
  - The "latest completed scan" lookup appears in 3 places → `useLatestScan` hook.
  - The "no scan selected" empty state appears twice → shared component.
  - The confirm-dialog state setup appears twice → `useConfirm` hook.
- [ ] **Errors are mostly swallowed into `console.error`.** Show a toast when loading fails.
- [ ] **Accessibility:**
  - Clickable `<div>`s (recent scan rows) and `Badge`s aren't reachable by keyboard; use buttons or links.
  - `ConfirmDialog` lacks `role="dialog"`, `aria-modal` and focus trapping.
- [ ] **Dead code:**
  - `RequireLaunch` and the `data-vantage-launched` localStorage flag are no longer used.
  - `truncatePath` in `lib/utils.ts` is unused.
  - The `modifiedTime` workaround in `FileTable` exists only to cope with old values saved in `localStorage`.
- [ ] **No tests and no ESLint config.** At minimum add `eslint-plugin-react-hooks`, which would have caught the hooks bug in 6.1.
