#include "api_server.h"
#include "database.h"
#include "hasher.h"
#include "scanner.h"

// We use cpp-httplib (header-only). Download it or include via CMake
// FetchContent.
#include "httplib.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fnmatch.h>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <thread>
#include <unordered_map>

// ============================================================================
// JSON helpers (minimal, no external dependency)
// ============================================================================

namespace json
{
    std::string escape(const std::string &s)
    {
        std::string out;
        out.reserve(s.size() + 10);
        for (char c : s)
        {
            switch (c)
            {
            case '"':
                out += "\\\"";
                break;
            case '\\':
                out += "\\\\";
                break;
            case '\n':
                out += "\\n";
                break;
            case '\r':
                out += "\\r";
                break;
            case '\t':
                out += "\\t";
                break;
            default:
                if (static_cast<unsigned char>(c) < 0x20)
                {
                    std::ostringstream hex;
                    hex << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                        << static_cast<int>(static_cast<unsigned char>(c));
                    out += hex.str();
                }
                else
                {
                    out += c;
                }
                break;
            }
        }
        return out;
    }

    std::string str(const std::string &key, const std::string &val)
    {
        return "\"" + key + "\":\"" + escape(val) + "\"";
    }

    std::string num(const std::string &key, int64_t val)
    {
        return "\"" + key + "\":" + std::to_string(val);
    }

    std::string numf(const std::string &key, double val)
    {
        std::ostringstream oss;
        oss << std::fixed << val;
        return "\"" + key + "\":" + oss.str();
    }

    std::string boolean(const std::string &key, bool val)
    {
        return "\"" + key + "\":" + (val ? "true" : "false");
    }

    std::string file_entry_json(const FileEntry &f)
    {
        return "{" + num("id", f.id) + "," + str("path", f.path) + "," +
               str("name", f.name) + "," + str("extension", f.extension) + "," +
               num("sizeOnDisk", f.size) + "," +
               num("modifiedTime", f.modified_time) + "," +
               boolean("isDirectory", f.is_directory) + "," + str("hash", f.hash) +
               "," + num("parentId", f.parent_id) + "}";
    }

    std::string scan_result_json(const ScanResult &r)
    {
        return "{" + num("scanId", r.scan_id) + "," + str("rootPath", r.root_path) +
               "," + num("totalFiles", r.total_files) + "," +
               num("totalDirectories", r.total_directories) + "," +
               num("totalSize", r.total_size) + "," +
               num("duplicateGroups", r.duplicate_groups) + "," +
               num("duplicateFiles", r.duplicate_files) + "," +
               num("wastedSpace", r.wasted_space) + "," +
               str("scanDate", r.scan_date) + "," +
               numf("scanDuration", r.scan_duration) + "," +
               str("status", r.status.empty() ? "completed" : r.status) + "}";
    }

    std::string progress_json(const ScanProgress &p)
    {
        return "{" + num("filesScanned", p.files_scanned) + "," +
               num("directoriesScanned", p.directories_scanned) + "," +
               num("totalSize", p.total_size) + "," +
               num("duplicatesFound", p.duplicates_found) + "," +
               num("skippedFiles", p.skipped_files) + "," +
               boolean("isScanning", p.is_scanning) + "," +
               str("currentPath", p.current_path) + "," +
               numf("elapsedSeconds", p.elapsed_seconds) + "," +
               numf("estimatedSecondsRemaining", p.estimated_seconds_remaining) +
               "," + numf("filesPerSecond", p.files_per_second) + "}";
    }

    std::string duplicate_group_json(const DuplicateGroup &g)
    {
        std::string files_arr = "[";
        for (size_t i = 0; i < g.files.size(); i++)
        {
            if (i > 0)
                files_arr += ",";
            files_arr += file_entry_json(g.files[i]);
        }
        files_arr += "]";

        return "{" + str("hash", g.hash) + "," + num("fileSize", g.file_size) + "," +
               num("wastedSpace", g.wasted_space) + "," +
               num("fileCount", static_cast<int64_t>(g.files.size())) + "," +
               "\"files\":" + files_arr + "}";
    }

    // Simple JSON parser for extracting a string value
    std::string extract_string(const std::string &json_str,
                               const std::string &key)
    {
        std::string search = "\"" + key + "\"";
        auto pos = json_str.find(search);
        if (pos == std::string::npos)
            return "";
        pos = json_str.find(':', pos);
        if (pos == std::string::npos)
            return "";
        pos = json_str.find('"', pos + 1);
        if (pos == std::string::npos)
            return "";
        auto end = json_str.find('"', pos + 1);
        if (end == std::string::npos)
            return "";
        return json_str.substr(pos + 1, end - pos - 1);
    }

    // Parse a JSON array of strings: {"key":["a","b"]}
    std::vector<std::string> extract_string_array(const std::string &json_str,
                                                  const std::string &key)
    {
        std::vector<std::string> result;
        std::string search = "\"" + key + "\"";
        auto pos = json_str.find(search);
        if (pos == std::string::npos)
            return result;
        pos = json_str.find('[', pos);
        if (pos == std::string::npos)
            return result;
        auto end = json_str.find(']', pos);
        if (end == std::string::npos)
            return result;
        std::string arr = json_str.substr(pos + 1, end - pos - 1);
        size_t i = 0;
        while (i < arr.size())
        {
            auto start = arr.find('"', i);
            if (start == std::string::npos)
                break;
            auto stop = arr.find('"', start + 1);
            if (stop == std::string::npos)
                break;
            result.push_back(arr.substr(start + 1, stop - start - 1));
            i = stop + 1;
        }
        return result;
    }

    // Simple JSON integer extractor (returns 0 if missing)
    int64_t extract_int64(const std::string &json_str, const std::string &key)
    {
        std::string search = "\"" + key + "\"";
        auto pos = json_str.find(search);
        if (pos == std::string::npos)
            return 0;
        pos = json_str.find(':', pos);
        if (pos == std::string::npos)
            return 0;
        // Move to first non-space
        size_t i = pos + 1;
        while (i < json_str.size() && isspace((unsigned char)json_str[i]))
            i++;
        if (i >= json_str.size())
            return 0;
        // parse optional sign
        size_t start = i;
        if (json_str[i] == '+' || json_str[i] == '-')
            i++;
        if (i >= json_str.size() || !isdigit((unsigned char)json_str[i]))
            return 0;
        while (i < json_str.size() && isdigit((unsigned char)json_str[i]))
            i++;
        try
        {
            return std::stoll(json_str.substr(start, i - start));
        }
        catch (...)
        {
            return 0;
        }
    }

} // namespace json

// ============================================================================
// Web asset helpers
// ============================================================================

static bool starts_with(const std::string &value, const std::string &prefix)
{
    return value.rfind(prefix, 0) == 0;
}

static std::string join_path(const std::string &base, const std::string &name)
{
    if (base.empty())
        return name;
    if (base.back() == '/')
        return base + name;
    return base + "/" + name;
}

static bool read_file_text(const std::string &path, std::string &out)
{
    std::ifstream file(path, std::ios::in | std::ios::binary);
    if (!file)
        return false;
    std::ostringstream buffer;
    buffer << file.rdbuf();
    out = buffer.str();
    return true;
}

static bool is_within_root(const std::string &path,
                           const std::string &root_path)
{
    namespace fs = std::filesystem;
    fs::path candidate(path);
    fs::path root(root_path);
    if (candidate == root)
        return true;

    std::string root_prefix = root.string();
    if (!root_prefix.empty() &&
        root_prefix.back() != fs::path::preferred_separator)
    {
        root_prefix += fs::path::preferred_separator;
    }

    return starts_with(candidate.string(), root_prefix);
}

// ============================================================================
// File exclusion helpers
// ============================================================================

static const std::vector<std::string> DEFAULT_EXCLUSIONS = {
    "*.dll",
    "*.exe",
    "*.so",
    "*.bin",
    "*.class",
    "*.pyc",
    "*.o",
    "*.bk2",
    "node_modules/**",
    "build/**",
    ".git/**",
    "dist/**",
    "__pycache__/**",
    ".cache/**",
    "vendor/**",
    ".npm/**",
    "bower_components/**"};

static std::string str_tolower(std::string s)
{
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c)
                   { return std::tolower(c); });
    return s;
}

static bool matches_exclusion(const std::string &rel_path,
                              const std::string &filename,
                              const std::string &pattern)
{
    std::string pat = str_tolower(pattern);
    std::string rel = str_tolower(rel_path);
    std::string name = str_tolower(filename);

    // Exact filename match (no wildcards, no slashes)
    if (pat.find('*') == std::string::npos && pat.find('/') == std::string::npos)
        return name == pat;

    // *.ext — simple extension match
    if (pat.size() >= 2 && pat[0] == '*' && pat[1] == '.' &&
        pat.find('/', 0) == std::string::npos &&
        pat.find('*', 1) == std::string::npos)
    {
        std::string ext = pat.substr(1); // e.g. ".dll"
        return name.size() >= ext.size() &&
               name.compare(name.size() - ext.size(), ext.size(), ext) == 0;
    }

    // **/*.ext or **/pattern — match sub-pattern against filename or path
    if (pat.size() > 3 && pat.substr(0, 3) == "**/")
    {
        std::string sub = pat.substr(3);
        // **/dir/** — directory anywhere in path
        if (sub.size() > 3 && sub.substr(sub.size() - 3) == "/**")
        {
            std::string dir = sub.substr(0, sub.size() - 3);
            return rel.find("/" + dir + "/") != std::string::npos ||
                   rel.substr(0, dir.size() + 1) == dir + "/";
        }
        // **/*.ext or **/name — match against filename
        return fnmatch(sub.c_str(), name.c_str(), FNM_CASEFOLD) == 0;
    }

    // dir/** — match directory at root or anywhere in path
    if (pat.size() > 3 && pat.substr(pat.size() - 3) == "/**")
    {
        std::string prefix = pat.substr(0, pat.size() - 3);
        // At root of relative path
        if (rel.size() > prefix.size() && rel.substr(0, prefix.size()) == prefix &&
            rel[prefix.size()] == '/')
            return true;
        // Anywhere in path (e.g. sub/node_modules/...)
        return rel.find("/" + prefix + "/") != std::string::npos;
    }

    // Fallback: fnmatch against filename and relative path
    return fnmatch(pat.c_str(), name.c_str(), FNM_CASEFOLD) == 0 ||
           fnmatch(pat.c_str(), rel.c_str(), FNM_CASEFOLD | FNM_PATHNAME) == 0;
}

static bool is_binary_file(const std::string &filepath)
{
    std::ifstream file(filepath, std::ios::binary);
    if (!file)
        return false;
    char buf[8192];
    file.read(buf, sizeof(buf));
    auto bytes_read = file.gcount();
    if (bytes_read == 0)
        return false;
    int non_text = 0;
    for (std::streamsize i = 0; i < bytes_read; i++)
    {
        unsigned char c = static_cast<unsigned char>(buf[i]);
        if (c == 0)
            return true; // null byte → binary
        if (c < 7 || (c > 14 && c < 32 && c != 27))
            non_text++;
    }
    return static_cast<double>(non_text) / bytes_read > 0.3;
}

static bool should_exclude_file(const std::string &filepath,
                                const std::string &root_path,
                                const std::vector<std::string> &exclusions)
{
    namespace fs = std::filesystem;
    std::string rel = filepath;
    if (filepath.size() > root_path.size() &&
        filepath.substr(0, root_path.size()) == root_path)
    {
        rel = filepath.substr(root_path.size());
        if (!rel.empty() && rel[0] == '/')
            rel = rel.substr(1);
    }
    std::string fname = fs::path(filepath).filename().string();

    for (const auto &pat : exclusions)
    {
        if (matches_exclusion(rel, fname, pat))
            return true;
    }

    // Binary content sniffing when extension is missing
    std::string ext = fs::path(filepath).extension().string();
    if (ext.empty() && is_binary_file(filepath))
        return true;

    return false;
}

// ============================================================================
// Active scan state
// ============================================================================

struct ActiveScan
{
    int64_t scan_id;
    std::unique_ptr<Scanner> scanner;
    std::thread thread;
    std::mutex mutex;
    ScanProgress last_progress;
    bool completed = false;
    std::string status = "scanning"; // "scanning", "hashing", "completed"
    std::chrono::steady_clock::time_point
        start_time; // tracks wall-clock from scan start
    // Hashing progress tracking
    std::atomic<uint64_t> hash_files_total{0};
    std::atomic<uint64_t> hash_files_done{0};
    std::chrono::steady_clock::time_point hash_start_time;
    std::vector<std::string> exclusions;
};

// ============================================================================
// API Server Implementation
// ============================================================================

struct ApiServer::Impl
{
    httplib::Server server;
    std::string host;
    int port;
    Database db;
    std::string web_root;
    bool web_root_enabled = false;
    std::mutex scan_mutex;
    std::map<int64_t, std::shared_ptr<ActiveScan>> active_scans;
    std::map<int64_t, std::vector<std::string>>
        scan_exclusions; // persist across scan lifetime

    Impl(const std::string &h, int p, const std::string &web_root_path)
        : host(h), port(p), db("data_vantage.db"), web_root(web_root_path) {}

    void setup_routes()
    {
        // CORS middleware
        server.set_pre_routing_handler(
            [](const httplib::Request &, httplib::Response &res)
            {
                res.set_header("Access-Control-Allow-Origin", "*");
                res.set_header("Access-Control-Allow-Methods",
                               "GET, POST, PUT, DELETE, OPTIONS");
                res.set_header("Access-Control-Allow-Headers",
                               "Content-Type, Authorization");
                return httplib::Server::HandlerResponse::Unhandled;
            });

        server.Options("/(.*)",
                       [](const httplib::Request &, httplib::Response &res)
                       {
                           res.set_header("Access-Control-Allow-Origin", "*");
                           res.set_header("Access-Control-Allow-Methods",
                                          "GET, POST, PUT, DELETE, OPTIONS");
                           res.set_header("Access-Control-Allow-Headers",
                                          "Content-Type, Authorization");
                           res.status = 204;
                       });

        // Health check
        server.Get(
            "/api/health", [](const httplib::Request &, httplib::Response &res)
            { res.set_content("{\"status\":\"ok\",\"service\":\"Data-Vantage\"}",
                              "application/json"); });

        // Try to open a native directory picker (zenity, kdialog). Returns
        // {"path":"/selected/path"} or {"path":""} when unavailable
        server.Get("/api/pick-directory", [](const httplib::Request &,
                                             httplib::Response &res)
                   {
      auto run_cmd = [](const std::string &cmd) -> std::string {
        std::string result;
        FILE *pipe = popen(cmd.c_str(), "r");
        if (!pipe)
          return result;
        char buffer[4096];
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
          result += buffer;
        }
        pclose(pipe);
        // Trim trailing newlines/spaces
        while (!result.empty() &&
               (result.back() == '\n' || result.back() == '\r' ||
                result.back() == ' '))
          result.pop_back();
        return result;
      };

      std::string picked;

#ifdef __APPLE__
      picked = run_cmd("osascript -e 'POSIX path of (choose folder with "
                       "prompt \"Select folder to scan\")' 2>/dev/null");
#endif

      // Try common Linux desktop pickers if the platform picker is unavailable.
      if (picked.empty()) {
        picked = run_cmd("kdialog --getexistingdirectory 2>/dev/null");
      }
      if (picked.empty()) {
        picked = run_cmd("zenity --file-selection --directory "
                         "--title=\"Select%20Folder\" 2>/dev/null");
      }

      // If still empty, return an empty path so frontend can fallback to manual
      // input
      std::string body = "{\"path\":\"" + json::escape(picked) + "\"}";
      res.set_content(body, "application/json"); });

        // ---- SCAN ENDPOINTS ----

        // Start a new scan
        server.Post("/api/scans", [this](const httplib::Request &req,
                                         httplib::Response &res)
                    {
      std::string path = json::extract_string(req.body, "path");
      if (path.empty()) {
        res.status = 400;
        res.set_content("{\"error\":\"Missing 'path' in request body\"}",
                        "application/json");
        return;
      }

      // Check if path exists
      std::error_code exists_ec;
      if (!std::filesystem::exists(path, exists_ec) || exists_ec) {
        res.status = 400;
        res.set_content("{\"error\":\"Path does not exist\"}",
                        "application/json");
        return;
      }

      int64_t scan_id = db.create_scan(path);

      auto active = std::make_shared<ActiveScan>();
      active->scan_id = scan_id;
      active->scanner = std::make_unique<Scanner>();
      active->completed = false;
      active->status = "scanning";
      active->start_time = std::chrono::steady_clock::now();

      // Parse exclusion list (use default if not provided)
      auto exclusions = json::extract_string_array(req.body, "exclusions");
      if (exclusions.empty())
        exclusions = DEFAULT_EXCLUSIONS;
      active->exclusions = exclusions;

      // Parse minimum file size to include (bytes)
      int64_t min_size = json::extract_int64(req.body, "minSize");

      {
        std::lock_guard<std::mutex> lock(scan_mutex);
        active_scans[scan_id] = active;
        scan_exclusions[scan_id] = exclusions;
      }

      // Start scan in background thread
      active->thread = std::thread([this, active, path, scan_id, min_size]() {
        try {
          active->scanner->scan(
              path,
              [&active](const ScanProgress &p) {
                std::lock_guard<std::mutex> lock(active->mutex);
                active->last_progress = p;
              },
              static_cast<uint64_t>(min_size));

          // Filesystem walk done; now hashing duplicates
          {
            std::lock_guard<std::mutex> lock(active->mutex);
            active->status = "hashing";
          }

          auto files = active->scanner->get_files();

          // Precompute directory sizes in memory (O(N) bottom-up pass)
          std::unordered_map<int64_t, size_t> id_to_index;
          id_to_index.reserve(files.size());
          for (size_t i = 0; i < files.size(); ++i) {
            id_to_index[files[i].id] = i;
          }
          for (size_t i = files.size(); i > 0; --i) {
            size_t idx = i - 1;
            const auto &fe = files[idx];
            if (fe.parent_id >= 0) {
              auto it = id_to_index.find(fe.parent_id);
              if (it != id_to_index.end()) {
                files[it->second].size += fe.size;
              }
            }
          }

          // Hash files and find duplicates
          // Filter out excluded files before duplicate detection
          std::string root_normalized = path;
          if (!root_normalized.empty() && root_normalized.back() != '/')
            root_normalized += '/';

          std::unordered_map<std::string, std::vector<size_t>> size_groups;
          for (size_t i = 0; i < files.size(); i++) {
            if (!files[i].is_directory && files[i].size > 0 &&
                !should_exclude_file(files[i].path, root_normalized,
                                     active->exclusions)) {
              size_groups[std::to_string(files[i].size)].push_back(i);
            }
          }

          // Count total files that need hashing (in groups of 2+)
          uint64_t total_to_hash = 0;
          for (auto &[size_key, indices] : size_groups) {
            if (indices.size() >= 2)
              total_to_hash += indices.size();
          }
          active->hash_files_total = total_to_hash;
          active->hash_files_done = 0;
          active->hash_start_time = std::chrono::steady_clock::now();

          std::vector<DuplicateGroup> dup_groups;
          uint64_t total_dup_files = 0;
          uint64_t total_wasted = 0;

          for (auto &[size_key, indices] : size_groups) {
            if (indices.size() < 2)
              continue;

            // Quick hash first
            std::unordered_map<std::string, std::vector<size_t>> hash_groups;
            for (size_t idx : indices) {
              std::string h =
                  Hasher::quick_hash(files[idx].path, files[idx].size);
              if (!h.empty()) {
                files[idx].hash = h;
                hash_groups[h].push_back(idx);
              }
              active->hash_files_done++;
            }

            // Full hash for groups with matching quick hashes
            for (auto &[qhash, qindices] : hash_groups) {
              if (qindices.size() < 2)
                continue;

              std::unordered_map<std::string, std::vector<size_t>>
                  full_hash_groups;
              for (size_t idx : qindices) {
                std::string fh =
                    Hasher::hash_file(files[idx].path, files[idx].size);
                if (!fh.empty()) {
                  files[idx].hash = fh;
                  full_hash_groups[fh].push_back(idx);
                }
              }

              for (auto &[fhash, findices] : full_hash_groups) {
                if (findices.size() < 2)
                  continue;

                DuplicateGroup group;
                group.hash = fhash;
                group.file_size = files[findices[0]].size;
                group.wasted_space = group.file_size * (findices.size() - 1);

                for (size_t idx : findices) {
                  group.files.push_back(files[idx]);
                }

                total_dup_files += findices.size();
                total_wasted += group.wasted_space;
                dup_groups.push_back(group);
              }
            }
          }

          // Store results in database
          db.insert_files(scan_id, files);
          db.store_duplicates(scan_id, dup_groups);

          ScanResult result;
          result.scan_id = scan_id;
          result.root_path = path;
          {
            std::lock_guard<std::mutex> lock(active->mutex);
            result.total_files = active->last_progress.files_scanned;
            result.total_directories =
                active->last_progress.directories_scanned;
            result.total_size = active->last_progress.total_size;
          }
          result.duplicate_groups = dup_groups.size();
          result.duplicate_files = total_dup_files;
          result.wasted_space = total_wasted;
          result.scan_duration =
              std::chrono::duration<double>(std::chrono::steady_clock::now() -
                                            active->start_time)
                  .count();
          result.status = "completed";

          db.complete_scan(scan_id, result);

          {
            std::lock_guard<std::mutex> lock(active->mutex);
            active->last_progress.duplicates_found = dup_groups.size();
            active->last_progress.is_scanning = false;
            active->last_progress.elapsed_seconds =
                std::chrono::duration<double>(std::chrono::steady_clock::now() -
                                              active->start_time)
                    .count();
            active->status = "completed";
            active->completed = true;
          }
        } catch (const std::exception &e) {
          std::cerr << "Scan failed with exception: " << e.what() << std::endl;
          db.fail_scan(scan_id);
          std::lock_guard<std::mutex> lock(active->mutex);
          active->status = "failed";
          active->completed = true;
          active->last_progress.is_scanning = false;
        } catch (...) {
          std::cerr << "Scan failed with unknown exception." << std::endl;
          db.fail_scan(scan_id);
          std::lock_guard<std::mutex> lock(active->mutex);
          active->status = "failed";
          active->completed = true;
          active->last_progress.is_scanning = false;
        }
      });

      active->thread.detach();

      res.set_content("{\"scanId\":" + std::to_string(scan_id) +
                          ",\"status\":\"started\"}",
                      "application/json"); });

        // Get scan progress
        server.Get(R"(/api/scans/(\d+)/progress)", [this](
                                                       const httplib::Request &req,
                                                       httplib::Response &res)
                   {
      int64_t scan_id = std::stoll(req.matches[1]);

      std::lock_guard<std::mutex> lock(scan_mutex);
      auto it = active_scans.find(scan_id);
      if (it != active_scans.end()) {
        auto &active = it->second;
        ScanProgress progress;
        bool completed = false;
        std::string status;
        {
          std::lock_guard<std::mutex> active_lock(active->mutex);
          if (active->scanner && active->scanner->is_scanning()) {
            progress = active->scanner->get_progress();
          } else {
            progress = active->last_progress;
          }
          completed = active->completed;
          status = active->status;
        }
        // While the background thread is still running (scanning or hashing),
        // keep reporting isScanning=true with a live elapsed time so the
        // frontend continues to poll and the timer keeps ticking.
        if (!completed) {
          progress.is_scanning = true;
          progress.elapsed_seconds =
              std::chrono::duration<double>(std::chrono::steady_clock::now() -
                                            active->start_time)
                  .count();

          // Compute hashing ETA if in hashing phase
          if (status == "hashing" && active->hash_files_total > 0) {
            uint64_t done = active->hash_files_done.load();
            uint64_t total_h = active->hash_files_total.load();
            if (done > 0) {
              double hash_elapsed = std::chrono::duration<double>(
                                        std::chrono::steady_clock::now() -
                                        active->hash_start_time)
                                        .count();
              double rate = static_cast<double>(done) / hash_elapsed;
              double remaining = static_cast<double>(total_h - done) / rate;
              progress.estimated_seconds_remaining = remaining;
            }
          }
        }
        // Append a "status" field to the JSON response
        std::string body = json::progress_json(progress);
        body.pop_back(); // remove trailing '}'
        body += "," + json::str("status", status) + "}";
        res.set_content(body, "application/json");
      } else {
        // Check if scan exists in DB
        auto scan = db.get_scan(scan_id);
        if (scan.scan_id > 0) {
          ScanProgress p;
          p.files_scanned = scan.total_files;
          p.directories_scanned = scan.total_directories;
          p.total_size = scan.total_size;
          p.duplicates_found = scan.duplicate_groups;
          p.skipped_files = 0;
          p.is_scanning = false;
          p.elapsed_seconds = scan.scan_duration;
          p.estimated_seconds_remaining = 0.0;
          p.files_per_second = 0.0;
          std::string body = json::progress_json(p);
          body.pop_back();
          body += "," +
                  json::str("status",
                            scan.status.empty() ? "completed" : scan.status) +
                  "}";
          res.set_content(body, "application/json");
        } else {
          res.status = 404;
          res.set_content("{\"error\":\"Scan not found\"}", "application/json");
        }
      } });

        // Stop a scan
        server.Post(R"(/api/scans/(\d+)/stop)", [this](const httplib::Request &req,
                                                       httplib::Response &res)
                    {
      int64_t scan_id = std::stoll(req.matches[1]);
      std::lock_guard<std::mutex> lock(scan_mutex);
      auto it = active_scans.find(scan_id);
      if (it != active_scans.end() && it->second->scanner) {
        it->second->scanner->stop();
        res.set_content("{\"status\":\"stopping\"}", "application/json");
      } else {
        res.status = 404;
        res.set_content("{\"error\":\"Active scan not found\"}",
                        "application/json");
      } });

        // Get scan result
        server.Get(R"(/api/scans/(\d+))", [this](const httplib::Request &req,
                                                 httplib::Response &res)
                   {
      int64_t scan_id = std::stoll(req.matches[1]);
      auto scan = db.get_scan(scan_id);
      if (scan.scan_id > 0) {
        res.set_content(json::scan_result_json(scan), "application/json");
      } else {
        res.status = 404;
        res.set_content("{\"error\":\"Scan not found\"}", "application/json");
      } });

        // Get all scans
        server.Get("/api/scans",
                   [this](const httplib::Request &, httplib::Response &res)
                   {
                       auto scans = db.get_all_scans();
                       std::string arr = "[";
                       for (size_t i = 0; i < scans.size(); i++)
                       {
                           if (i > 0)
                               arr += ",";
                           arr += json::scan_result_json(scans[i]);
                       }
                       arr += "]";
                       res.set_content(arr, "application/json");
                   });

        // Delete a scan
        server.Delete(R"(/api/scans/(\d+))", [this](const httplib::Request &req,
                                                    httplib::Response &res)
                      {
      int64_t scan_id = std::stoll(req.matches[1]);
      db.delete_scan(scan_id);
      {
        std::lock_guard<std::mutex> lock(scan_mutex);
        active_scans.erase(scan_id);
      }
      res.set_content("{\"status\":\"deleted\"}", "application/json"); });

        // ---- FILE ENDPOINTS ----

        // Get files for a scan
        server.Get(R"(/api/scans/(\d+)/files)",
                   [this](const httplib::Request &req, httplib::Response &res)
                   {
                       int64_t scan_id = std::stoll(req.matches[1]);
                       int64_t parent_id = -1;
                       int limit = 100;
                       int offset = 0;

                       if (req.has_param("parentId"))
                           parent_id = std::stoll(req.get_param_value("parentId"));
                       if (req.has_param("limit"))
                           limit = std::stoi(req.get_param_value("limit"));
                       if (req.has_param("offset"))
                           offset = std::stoi(req.get_param_value("offset"));

                       auto files = db.get_files(scan_id, parent_id, limit, offset);
                       std::string arr = "[";
                       for (size_t i = 0; i < files.size(); i++)
                       {
                           if (i > 0)
                               arr += ",";
                           arr += json::file_entry_json(files[i]);
                       }
                       arr += "]";
                       res.set_content(arr, "application/json");
                   });

        // Search files
        server.Get(R"(/api/scans/(\d+)/search)", [this](const httplib::Request &req,
                                                        httplib::Response &res)
                   {
      int64_t scan_id = std::stoll(req.matches[1]);
      std::string query = req.has_param("q") ? req.get_param_value("q") : "";

      if (query.empty()) {
        res.status = 400;
        res.set_content("{\"error\":\"Missing 'q' query parameter\"}",
                        "application/json");
        return;
      }

      auto files = db.search_files(scan_id, query);
      std::string arr = "[";
      for (size_t i = 0; i < files.size(); i++) {
        if (i > 0)
          arr += ",";
        arr += json::file_entry_json(files[i]);
      }
      arr += "]";
      res.set_content(arr, "application/json"); });

        // ---- DUPLICATE ENDPOINTS ----

        // Get duplicates for a scan
        server.Get(R"(/api/scans/(\d+)/duplicates)",
                   [this](const httplib::Request &req, httplib::Response &res)
                   {
                       int64_t scan_id = std::stoll(req.matches[1]);
                       int limit = 50;
                       int offset = 0;

                       if (req.has_param("limit"))
                           limit = std::stoi(req.get_param_value("limit"));
                       if (req.has_param("offset"))
                           offset = std::stoi(req.get_param_value("offset"));

                       auto groups = db.get_duplicates(scan_id, limit, offset);
                       uint64_t total = db.get_duplicate_count(scan_id);

                       std::string arr = "[";
                       for (size_t i = 0; i < groups.size(); i++)
                       {
                           if (i > 0)
                               arr += ",";
                           arr += json::duplicate_group_json(groups[i]);
                       }
                       arr += "]";

                       // Build exclusions array for response
                       std::string excl_arr = "[";
                       {
                           std::lock_guard<std::mutex> lock(scan_mutex);
                           auto eit = scan_exclusions.find(scan_id);
                           if (eit != scan_exclusions.end())
                           {
                               for (size_t i = 0; i < eit->second.size(); i++)
                               {
                                   if (i > 0)
                                       excl_arr += ",";
                                   excl_arr += "\"" + json::escape(eit->second[i]) + "\"";
                               }
                           }
                       }
                       excl_arr += "]";

                       std::string result = "{\"total\":" + std::to_string(total) +
                                            ",\"exclusions\":" + excl_arr +
                                            ",\"groups\":" + arr + "}";
                       res.set_content(result, "application/json");
                   });

        // ---- DELETE FILE ENDPOINTS ----

        // Delete files from disk and database
        server.Post(
            R"(/api/scans/(\d+)/files/delete)",
            [this](const httplib::Request &req, httplib::Response &res)
            {
                int64_t scan_id = std::stoll(req.matches[1]);

                auto paths = json::extract_string_array(req.body, "paths");
                if (paths.empty())
                {
                    res.status = 400;
                    res.set_content("{\"error\":\"Missing or empty 'paths' array\"}",
                                    "application/json");
                    return;
                }

                // Get scan to validate root path for path-traversal protection
                auto scan = db.get_scan(scan_id);
                if (scan.scan_id <= 0)
                {
                    res.status = 404;
                    res.set_content("{\"error\":\"Scan not found\"}",
                                    "application/json");
                    return;
                }

                namespace fs = std::filesystem;
                std::string root_canonical;
                try
                {
                    root_canonical = fs::weakly_canonical(scan.root_path).string();
                }
                catch (...)
                {
                    root_canonical = scan.root_path;
                }

                std::vector<std::string> deleted;
                std::vector<std::string> failed;

                for (const auto &path : paths)
                {
                    // Path traversal protection: resolve canonical and check prefix
                    std::string canonical_path;
                    try
                    {
                        canonical_path = fs::weakly_canonical(path).string();
                    }
                    catch (...)
                    {
                        canonical_path = path;
                    }

                    // Block paths outside the scan root
                    if (!is_within_root(canonical_path, root_canonical))
                    {
                        failed.push_back(path);
                        continue;
                    }

                    // Delete from disk (idempotent: ignore if already gone)
                    std::error_code ec;
                    if (fs::exists(path))
                    {
                        fs::remove(path, ec);
                        if (ec)
                        {
                            failed.push_back(path);
                            continue;
                        }
                    }

                    deleted.push_back(path);
                }

                // Remove successfully deleted files from DB
                if (!deleted.empty())
                {
                    db.delete_files_by_paths(scan_id, deleted);
                }

                std::string del_arr = "[";
                for (size_t i = 0; i < deleted.size(); i++)
                {
                    if (i > 0)
                        del_arr += ",";
                    del_arr += "\"" + json::escape(deleted[i]) + "\"";
                }
                del_arr += "]";

                std::string fail_arr = "[";
                for (size_t i = 0; i < failed.size(); i++)
                {
                    if (i > 0)
                        fail_arr += ",";
                    fail_arr += "\"" + json::escape(failed[i]) + "\"";
                }
                fail_arr += "]";

                res.set_content(
                    "{\"deleted\":" + del_arr + ",\"failed\":" + fail_arr +
                        ",\"deletedCount\":" + std::to_string(deleted.size()) +
                        ",\"failedCount\":" + std::to_string(failed.size()) + "}",
                    "application/json");
            });

        // Delete a duplicate group (keep one file, delete the rest)
        server.Post(
            R"(/api/scans/(\d+)/duplicates/delete-group)",
            [this](const httplib::Request &req, httplib::Response &res)
            {
                int64_t scan_id = std::stoll(req.matches[1]);

                std::string hash = json::extract_string(req.body, "hash");
                std::string keep_path = json::extract_string(req.body, "keepPath");

                if (hash.empty())
                {
                    res.status = 400;
                    res.set_content("{\"error\":\"Missing 'hash' in request body\"}",
                                    "application/json");
                    return;
                }
                if (keep_path.empty())
                {
                    res.status = 400;
                    res.set_content(
                        "{\"error\":\"Missing 'keepPath' in request body\"}",
                        "application/json");
                    return;
                }

                // Get scan for path-traversal protection
                auto scan = db.get_scan(scan_id);
                if (scan.scan_id <= 0)
                {
                    res.status = 404;
                    res.set_content("{\"error\":\"Scan not found\"}",
                                    "application/json");
                    return;
                }

                namespace fs = std::filesystem;
                std::string root_canonical;
                try
                {
                    root_canonical = fs::weakly_canonical(scan.root_path).string();
                }
                catch (...)
                {
                    root_canonical = scan.root_path;
                }

                // Get all files in the group to delete from disk (except keep_path)
                auto groups = db.get_duplicates(scan_id, 10000, 0);
                std::vector<std::string> to_delete;
                for (const auto &g : groups)
                {
                    if (g.hash == hash)
                    {
                        for (const auto &f : g.files)
                        {
                            if (f.path != keep_path)
                            {
                                to_delete.push_back(f.path);
                            }
                        }
                        break;
                    }
                }

                std::vector<std::string> deleted;
                std::vector<std::string> failed;

                for (const auto &path : to_delete)
                {
                    std::string canonical_path;
                    try
                    {
                        canonical_path = fs::weakly_canonical(path).string();
                    }
                    catch (...)
                    {
                        canonical_path = path;
                    }

                    if (!is_within_root(canonical_path, root_canonical))
                    {
                        failed.push_back(path);
                        continue;
                    }

                    std::error_code ec;
                    if (fs::exists(path))
                    {
                        fs::remove(path, ec);
                        if (ec)
                        {
                            failed.push_back(path);
                            continue;
                        }
                    }
                    deleted.push_back(path);
                }

                // Update DB: remove the group
                db.delete_duplicate_group(scan_id, hash, keep_path);

                std::string del_arr = "[";
                for (size_t i = 0; i < deleted.size(); i++)
                {
                    if (i > 0)
                        del_arr += ",";
                    del_arr += "\"" + json::escape(deleted[i]) + "\"";
                }
                del_arr += "]";

                std::string fail_arr = "[";
                for (size_t i = 0; i < failed.size(); i++)
                {
                    if (i > 0)
                        fail_arr += ",";
                    fail_arr += "\"" + json::escape(failed[i]) + "\"";
                }
                fail_arr += "]";

                res.set_content(
                    "{\"deleted\":" + del_arr + ",\"failed\":" + fail_arr +
                        ",\"deletedCount\":" + std::to_string(deleted.size()) +
                        ",\"failedCount\":" + std::to_string(failed.size()) +
                        ",\"kept\":\"" + json::escape(keep_path) + "\"}",
                    "application/json");
            });

        // ---- STATISTICS ENDPOINTS ----

        // Get file type statistics
        server.Get(R"(/api/scans/(\d+)/stats)",
                   [this](const httplib::Request &req, httplib::Response &res)
                   {
                       int64_t scan_id = std::stoll(req.matches[1]);
                       auto stats = db.get_file_type_stats(scan_id);

                       std::string arr = "[";
                       for (size_t i = 0; i < stats.size(); i++)
                       {
                           if (i > 0)
                               arr += ",";
                           arr += "{" + json::str("extension", stats[i].extension) +
                                  "," + json::num("count", stats[i].count) + "," +
                                  json::num("totalSize", stats[i].total_size) + "}";
                       }
                       arr += "]";
                       res.set_content(arr, "application/json");
                   });

        if (!web_root.empty())
        {
            namespace fs = std::filesystem;
            if (fs::exists(web_root))
            {
                if (!server.set_base_dir(web_root.c_str()))
                {
                    std::cerr << "Warning: failed to serve web root: " << web_root
                              << std::endl;
                }

                server.set_error_handler(
                    [this](const httplib::Request &req, httplib::Response &res)
                    {
                        if (res.status != 404)
                            return;
                        if (starts_with(req.path, "/api"))
                            return;

                        std::string index_path = join_path(web_root, "index.html");
                        std::string html;
                        if (read_file_text(index_path, html))
                        {
                            res.set_content(html, "text/html");
                            res.status = 200;
                        }
                    });

                web_root_enabled = true;
            }
            else
            {
                std::cerr << "Warning: web root not found: " << web_root << std::endl;
            }
        }
    }
};

ApiServer::ApiServer(const std::string &host, int port,
                     const std::string &web_root)
    : m_impl(std::make_unique<Impl>(host, port, web_root))
{
    m_impl->setup_routes();
}

ApiServer::~ApiServer() { stop(); }

void ApiServer::start()
{
    std::cout << "Data-Vantage API Server starting on " << m_impl->host << ":"
              << m_impl->port << std::endl;
    if (!m_impl->server.listen(m_impl->host, m_impl->port))
    {
        throw std::runtime_error("Failed to bind server on " + m_impl->host + ":" +
                                 std::to_string(m_impl->port));
    }
}

void ApiServer::stop() { m_impl->server.stop(); }
