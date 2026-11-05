#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <unordered_set>
#include <utility>
#include <vector>

#include "exclusions.h"

struct FileEntry
{
    int64_t id = 0;
    int64_t parent_id = -1;
    // For the root entry this is the full root path; for everything else it
    // is the last path component. Full paths are rebuilt from the parent chain.
    std::string name;
    std::string extension;
    uint64_t size = 0;         // apparent size (st_size); used to group duplicates
    uint64_t disk_size = 0;    // disk consumption (st_blocks * 512); folders sum this
    int64_t modified_time = 0; // seconds since the Unix epoch (st_mtime)
    bool is_directory = false;
    std::string hash;

    // Only filled in by the scanner (and by queries that resolve paths);
    // not stored in the database.
    std::string path;
};

struct ScanProgress
{
    uint64_t files_scanned = 0;
    uint64_t directories_scanned = 0;
    uint64_t total_size = 0;
    uint64_t duplicates_found = 0;
    uint64_t skipped_files = 0;
    bool is_scanning = false;
    std::string current_path;
    double elapsed_seconds = 0;
    double estimated_seconds_remaining = -1; // -1 if unknown
    double files_per_second = 0;
};

using ProgressCallback = std::function<void(const ScanProgress &)>;

struct ScanOptions
{
    uint64_t min_size = 0;
    ExclusionMatcher exclusions;
};

class Scanner
{
  public:
    Scanner() = default;

    // Walk root_path (iteratively; no recursion). Blocks until done or stopped.
    void scan(const std::string &root_path, const ScanOptions &options, const ProgressCallback &callback = nullptr);

    // Ask a running scan to stop. Safe to call from any thread.
    void stop() { m_stop_requested = true; }
    bool stop_requested() const { return m_stop_requested.load(); }

    // Safe to call from any thread while scan() runs.
    ScanProgress get_progress() const;
    bool is_scanning() const { return m_scanning.load(); }

    // Moves the collected entries out of the scanner. Only call after scan()
    // has returned. Entries are ordered so that a parent always precedes its
    // children, and entry i has id == i.
    std::vector<FileEntry> take_files() { return std::move(m_files); }

  private:
    struct PairHash
    {
        size_t operator()(const std::pair<uint64_t, uint64_t> &p) const noexcept
        {
            return std::hash<uint64_t>()(p.first) ^ (std::hash<uint64_t>()(p.second) * 0x9E3779B97F4A7C15ULL);
        }
    };

    // Everything below is touched only by the scanning thread, except the
    // atomics and m_current_path (guarded by m_path_mutex).
    std::vector<FileEntry> m_files;
    std::unordered_set<std::pair<uint64_t, uint64_t>, PairHash> m_visited_inodes; // (dev, ino)

    std::atomic<bool> m_scanning{false};
    std::atomic<bool> m_stop_requested{false};
    std::atomic<uint64_t> m_files_scanned{0};
    std::atomic<uint64_t> m_dirs_scanned{0};
    std::atomic<uint64_t> m_total_size{0};
    std::atomic<uint64_t> m_skipped_files{0};

    mutable std::mutex m_path_mutex;
    std::string m_current_path;
    std::chrono::steady_clock::time_point m_start_time{};
};
