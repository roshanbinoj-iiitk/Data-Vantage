#include "api_server.h"
#include "scanner.h"
#include "hasher.h"
#include "database.h"

// We use cpp-httplib (header-only). Download it or include via CMake FetchContent.
#include "httplib.h"

#include <filesystem>
#include <thread>
#include <mutex>
#include <map>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <chrono>
#include <atomic>
#include <unordered_map>
#include <fstream>
#include <fnmatch.h>

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
                out += c;
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
        return "{" +
               num("id", f.id) + "," +
               str("path", f.path) + "," +
               str("name", f.name) + "," +
               str("extension", f.extension) + "," +
               num("sizeOnDisk", f.size) + "," +
               num("modifiedTime", f.modified_time) + "," +
               boolean("isDirectory", f.is_directory) + "," +
               str("hash", f.hash) + "," +
               num("parentId", f.parent_id) +
               "}";
    }

    std::string scan_result_json(const ScanResult &r)
    {
        return "{" +
               num("scanId", r.scan_id) + "," +
               str("rootPath", r.root_path) + "," +
               num("totalFiles", r.total_files) + "," +
               num("totalDirectories", r.total_directories) + "," +
               num("totalSize", r.total_size) + "," +
               num("duplicateGroups", r.duplicate_groups) + "," +
               num("duplicateFiles", r.duplicate_files) + "," +
               num("wastedSpace", r.wasted_space) + "," +
               str("scanDate", r.scan_date) + "," +
               numf("scanDuration", r.scan_duration) +
               "}";
    }

    std::string progress_json(const ScanProgress &p)
    {
        return "{" +
               num("filesScanned", p.files_scanned) + "," +
               num("directoriesScanned", p.directories_scanned) + "," +
               num("totalSize", p.total_size) + "," +
               num("duplicatesFound", p.duplicates_found) + "," +
               num("skippedFiles", p.skipped_files) + "," +
               boolean("isScanning", p.is_scanning) + "," +
               str("currentPath", p.current_path) + "," +
               numf("elapsedSeconds", p.elapsed_seconds) + "," +
               numf("estimatedSecondsRemaining", p.estimated_seconds_remaining) + "," +
               numf("filesPerSecond", p.files_per_second) +
               "}";
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

        return "{" +
               str("hash", g.hash) + "," +
               num("fileSize", g.file_size) + "," +
               num("wastedSpace", g.wasted_space) + "," +
               num("fileCount", static_cast<int64_t>(g.files.size())) + "," +
               "\"files\":" + files_arr +
               "}";
    }

    // Simple JSON parser for extracting a string value
    std::string extract_string(const std::string &json_str, const std::string &key)
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
    std::vector<std::string> extract_string_array(const std::string &json_str, const std::string &key)
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

} // namespace json

// ============================================================================
// File exclusion helpers
// ============================================================================

static const std::vector<std::string> DEFAULT_EXCLUSIONS = {
    "*.dll", "*.exe", "*.so", "*.bin", "*.class", "*.pyc", "*.o", "*.bk2",
    "node_modules/**", "build/**", ".git/**", "dist/**", "__pycache__/**",
    ".cache/**", "vendor/**", ".npm/**", "bower_components/**"};

static std::string str_tolower(std::string s)
{
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c)
                   { return std::tolower(c); });
    return s;
}

static bool matches_exclusion(const std::string &rel_path, const std::string &filename,
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
        pat.find('/', 0) == std::string::npos && pat.find('*', 1) == std::string::npos)
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
        if (rel.size() > prefix.size() &&
            rel.substr(0, prefix.size()) == prefix &&
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

static bool should_exclude_file(const std::string &filepath, const std::string &root_path,
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
    ScanProgress last_progress;
    bool completed = false;
    std::string status = "scanning";                  // "scanning", "hashing", "completed"
    std::chrono::steady_clock::time_point start_time; // tracks wall-clock from scan start
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
    std::mutex scan_mutex;
    std::map<int64_t, std::shared_ptr<ActiveScan>> active_scans;
    std::map<int64_t, std::vector<std::string>> scan_exclusions; // persist across scan lifetime

    Impl(const std::string &h, int p) : host(h), port(p), db("data_vantage.db") {}

    void setup_routes()
    {
        // CORS middleware
        server.set_pre_routing_handler([](const httplib::Request &, httplib::Response &res)
                                       {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
            return httplib::Server::HandlerResponse::Unhandled; });

        server.Options("/(.*)", [](const httplib::Request &, httplib::Response &res)
                       {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
            res.status = 204; });

        // Health check
        server.Get("/api/health", [](const httplib::Request &, httplib::Response &res)
                   { res.set_content("{\"status\":\"ok\",\"service\":\"Data-Vantage\"}", "application/json"); });

        // ---- SCAN ENDPOINTS ----

        // Start a new scan
        server.Post("/api/scans", [this](const httplib::Request &req, httplib::Response &res)
                    {
            std::string path = json::extract_string(req.body, "path");
            if (path.empty()) {
                res.status = 400;
                res.set_content("{\"error\":\"Missing 'path' in request body\"}", "application/json");
                return;
            }

            // Check if path exists
            if (!std::filesystem::exists(path)) {
                res.status = 400;
                res.set_content("{\"error\":\"Path does not exist\"}", "application/json");
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

            {
                std::lock_guard<std::mutex> lock(scan_mutex);
                active_scans[scan_id] = active;
                scan_exclusions[scan_id] = exclusions;
            }

            // Start scan in background thread
            active->thread = std::thread([this, active, path, scan_id]() {
                active->scanner->scan(path, [&active](const ScanProgress& p) {
                    active->last_progress = p;
                });

                // Filesystem walk done; now hashing duplicates
                active->status = "hashing";

                auto files = active->scanner->get_files();

                // Hash files and find duplicates
                // Filter out excluded files before duplicate detection
                std::string root_normalized = path;
                if (!root_normalized.empty() && root_normalized.back() != '/')
                    root_normalized += '/';

                std::unordered_map<std::string, std::vector<size_t>> size_groups;
                for (size_t i = 0; i < files.size(); i++) {
                    if (!files[i].is_directory && files[i].size > 0 &&
                        !should_exclude_file(files[i].path, root_normalized, active->exclusions)) {
                        size_groups[std::to_string(files[i].size)].push_back(i);
                    }
                }

                // Count total files that need hashing (in groups of 2+)
                uint64_t total_to_hash = 0;
                for (auto& [size_key, indices] : size_groups) {
                    if (indices.size() >= 2) total_to_hash += indices.size();
                }
                active->hash_files_total = total_to_hash;
                active->hash_files_done = 0;
                active->hash_start_time = std::chrono::steady_clock::now();

                std::vector<DuplicateGroup> dup_groups;
                uint64_t total_dup_files = 0;
                uint64_t total_wasted = 0;

                for (auto& [size_key, indices] : size_groups) {
                    if (indices.size() < 2) continue;

                    // Quick hash first
                    std::unordered_map<std::string, std::vector<size_t>> hash_groups;
                    for (size_t idx : indices) {
                        std::string h = Hasher::quick_hash(files[idx].path, files[idx].size);
                        if (!h.empty()) {
                            files[idx].hash = h;
                            hash_groups[h].push_back(idx);
                        }
                        active->hash_files_done++;
                    }

                    // Full hash for groups with matching quick hashes
                    for (auto& [qhash, qindices] : hash_groups) {
                        if (qindices.size() < 2) continue;

                        std::unordered_map<std::string, std::vector<size_t>> full_hash_groups;
                        for (size_t idx : qindices) {
                            std::string fh = Hasher::hash_file(files[idx].path, files[idx].size);
                            if (!fh.empty()) {
                                files[idx].hash = fh;
                                full_hash_groups[fh].push_back(idx);
                            }
                        }

                        for (auto& [fhash, findices] : full_hash_groups) {
                            if (findices.size() < 2) continue;

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
                result.total_files = active->last_progress.files_scanned;
                result.total_directories = active->last_progress.directories_scanned;
                result.total_size = active->last_progress.total_size;
                result.duplicate_groups = dup_groups.size();
                result.duplicate_files = total_dup_files;
                result.wasted_space = total_wasted;
                result.scan_duration =
                    std::chrono::duration<double>(
                        std::chrono::steady_clock::now() - active->start_time)
                        .count();

                db.complete_scan(scan_id, result);

                active->last_progress.duplicates_found = dup_groups.size();
                active->last_progress.is_scanning = false;
                active->last_progress.elapsed_seconds =
                    std::chrono::duration<double>(
                        std::chrono::steady_clock::now() - active->start_time)
                        .count();
                active->status = "completed";
                active->completed = true;
            });

            active->thread.detach();

            res.set_content("{\"scanId\":" + std::to_string(scan_id) + ",\"status\":\"started\"}", "application/json"); });

        // Get scan progress
        server.Get(R"(/api/scans/(\d+)/progress)", [this](const httplib::Request &req, httplib::Response &res)
                   {
            int64_t scan_id = std::stoll(req.matches[1]);

            std::lock_guard<std::mutex> lock(scan_mutex);
            auto it = active_scans.find(scan_id);
            if (it != active_scans.end()) {
                auto& active = it->second;
                ScanProgress progress;
                if (active->scanner && active->scanner->is_scanning()) {
                    progress = active->scanner->get_progress();
                } else {
                    progress = active->last_progress;
                }
                // While the background thread is still running (scanning or hashing),
                // keep reporting isScanning=true with a live elapsed time so the
                // frontend continues to poll and the timer keeps ticking.
                if (!active->completed) {
                    progress.is_scanning = true;
                    progress.elapsed_seconds =
                        std::chrono::duration<double>(
                            std::chrono::steady_clock::now() - active->start_time)
                            .count();

                    // Compute hashing ETA if in hashing phase
                    if (active->status == "hashing" && active->hash_files_total > 0) {
                        uint64_t done = active->hash_files_done.load();
                        uint64_t total_h = active->hash_files_total.load();
                        if (done > 0) {
                            double hash_elapsed = std::chrono::duration<double>(
                                std::chrono::steady_clock::now() - active->hash_start_time).count();
                            double rate = static_cast<double>(done) / hash_elapsed;
                            double remaining = static_cast<double>(total_h - done) / rate;
                            progress.estimated_seconds_remaining = remaining;
                        }
                    }
                }
                // Append a "status" field to the JSON response
                std::string body = json::progress_json(progress);
                body.pop_back(); // remove trailing '}'
                body += "," + json::str("status", active->status) + "}";
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
                    res.set_content(json::progress_json(p), "application/json");
                } else {
                    res.status = 404;
                    res.set_content("{\"error\":\"Scan not found\"}", "application/json");
                }
            } });

        // Stop a scan
        server.Post(R"(/api/scans/(\d+)/stop)", [this](const httplib::Request &req, httplib::Response &res)
                    {
            int64_t scan_id = std::stoll(req.matches[1]);
            std::lock_guard<std::mutex> lock(scan_mutex);
            auto it = active_scans.find(scan_id);
            if (it != active_scans.end() && it->second->scanner) {
                it->second->scanner->stop();
                res.set_content("{\"status\":\"stopping\"}", "application/json");
            } else {
                res.status = 404;
                res.set_content("{\"error\":\"Active scan not found\"}", "application/json");
            } });

        // Get scan result
        server.Get(R"(/api/scans/(\d+))", [this](const httplib::Request &req, httplib::Response &res)
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
        server.Get("/api/scans", [this](const httplib::Request &, httplib::Response &res)
                   {
            auto scans = db.get_all_scans();
            std::string arr = "[";
            for (size_t i = 0; i < scans.size(); i++) {
                if (i > 0) arr += ",";
                arr += json::scan_result_json(scans[i]);
            }
            arr += "]";
            res.set_content(arr, "application/json"); });

        // Delete a scan
        server.Delete(R"(/api/scans/(\d+))", [this](const httplib::Request &req, httplib::Response &res)
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
        server.Get(R"(/api/scans/(\d+)/files)", [this](const httplib::Request &req, httplib::Response &res)
                   {
            int64_t scan_id = std::stoll(req.matches[1]);
            int64_t parent_id = -1;
            int limit = 100;
            int offset = 0;

            if (req.has_param("parentId")) parent_id = std::stoll(req.get_param_value("parentId"));
            if (req.has_param("limit")) limit = std::stoi(req.get_param_value("limit"));
            if (req.has_param("offset")) offset = std::stoi(req.get_param_value("offset"));

            auto files = db.get_files(scan_id, parent_id, limit, offset);
            std::string arr = "[";
            for (size_t i = 0; i < files.size(); i++) {
                if (i > 0) arr += ",";
                arr += json::file_entry_json(files[i]);
            }
            arr += "]";
            res.set_content(arr, "application/json"); });

        // Search files
        server.Get(R"(/api/scans/(\d+)/search)", [this](const httplib::Request &req, httplib::Response &res)
                   {
            int64_t scan_id = std::stoll(req.matches[1]);
            std::string query = req.has_param("q") ? req.get_param_value("q") : "";

            if (query.empty()) {
                res.status = 400;
                res.set_content("{\"error\":\"Missing 'q' query parameter\"}", "application/json");
                return;
            }

            auto files = db.search_files(scan_id, query);
            std::string arr = "[";
            for (size_t i = 0; i < files.size(); i++) {
                if (i > 0) arr += ",";
                arr += json::file_entry_json(files[i]);
            }
            arr += "]";
            res.set_content(arr, "application/json"); });

        // ---- DUPLICATE ENDPOINTS ----

        // Get duplicates for a scan
        server.Get(R"(/api/scans/(\d+)/duplicates)", [this](const httplib::Request &req, httplib::Response &res)
                   {
            int64_t scan_id = std::stoll(req.matches[1]);
            int limit = 50;
            int offset = 0;

            if (req.has_param("limit")) limit = std::stoi(req.get_param_value("limit"));
            if (req.has_param("offset")) offset = std::stoi(req.get_param_value("offset"));

            auto groups = db.get_duplicates(scan_id, limit, offset);
            uint64_t total = db.get_duplicate_count(scan_id);

            std::string arr = "[";
            for (size_t i = 0; i < groups.size(); i++) {
                if (i > 0) arr += ",";
                arr += json::duplicate_group_json(groups[i]);
            }
            arr += "]";

            // Build exclusions array for response
            std::string excl_arr = "[";
            {
                std::lock_guard<std::mutex> lock(scan_mutex);
                auto eit = scan_exclusions.find(scan_id);
                if (eit != scan_exclusions.end()) {
                    for (size_t i = 0; i < eit->second.size(); i++) {
                        if (i > 0) excl_arr += ",";
                        excl_arr += "\"" + json::escape(eit->second[i]) + "\"";
                    }
                }
            }
            excl_arr += "]";

            std::string result = "{\"total\":" + std::to_string(total) +
                                 ",\"exclusions\":" + excl_arr +
                                 ",\"groups\":" + arr + "}";
            res.set_content(result, "application/json"); });

        // ---- STATISTICS ENDPOINTS ----

        // Get file type statistics
        server.Get(R"(/api/scans/(\d+)/stats)", [this](const httplib::Request &req, httplib::Response &res)
                   {
            int64_t scan_id = std::stoll(req.matches[1]);
            auto stats = db.get_file_type_stats(scan_id);

            std::string arr = "[";
            for (size_t i = 0; i < stats.size(); i++) {
                if (i > 0) arr += ",";
                arr += "{" +
                    json::str("extension", stats[i].extension) + "," +
                    json::num("count", stats[i].count) + "," +
                    json::num("totalSize", stats[i].total_size) +
                "}";
            }
            arr += "]";
            res.set_content(arr, "application/json"); });
    }
};

ApiServer::ApiServer(const std::string &host, int port)
    : m_impl(std::make_unique<Impl>(host, port))
{
    m_impl->setup_routes();
}

ApiServer::~ApiServer()
{
    stop();
}

void ApiServer::start()
{
    std::cout << "Data-Vantage API Server starting on " << m_impl->host << ":" << m_impl->port << std::endl;
    m_impl->server.listen(m_impl->host, m_impl->port);
}

void ApiServer::stop()
{
    m_impl->server.stop();
}
