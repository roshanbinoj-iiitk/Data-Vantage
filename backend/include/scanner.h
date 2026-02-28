#pragma once

#include <string>
#include <vector>
#include <functional>
#include <atomic>
#include <mutex>
#include <cstdint>
#include <set>
#include <utility>

struct FileEntry
{
    std::string path;
    std::string name;
    std::string extension;
    uint64_t size; // disk consumption (st_blocks * 512) on Linux, apparent size elsewhere
    uint64_t modified_time;
    bool is_directory;
    std::string hash;
    int64_t parent_id;
    int64_t id;
};

struct ScanProgress
{
    uint64_t files_scanned;
    uint64_t directories_scanned;
    uint64_t total_size;
    uint64_t duplicates_found;
    uint64_t skipped_files;
    bool is_scanning;
    std::string current_path;
    double elapsed_seconds;
    double estimated_seconds_remaining; // -1 if unknown
    double files_per_second;
};

using ProgressCallback = std::function<void(const ScanProgress &)>;

class Scanner
{
public:
    Scanner();
    ~Scanner();

    // Start scanning a directory recursively
    void scan(const std::string &root_path, ProgressCallback callback = nullptr);

    // Stop ongoing scan
    void stop();

    // Get current progress
    ScanProgress get_progress() const;

    // Get all scanned files
    std::vector<FileEntry> get_files() const;

    // Check if scanning
    bool is_scanning() const;

private:
    void scan_recursive(const std::string &path, int64_t parent_id);

    std::vector<FileEntry> m_files;
    mutable std::mutex m_mutex;
    std::atomic<bool> m_scanning;
    std::atomic<bool> m_stop_requested;
    std::atomic<uint64_t> m_files_scanned;
    std::atomic<uint64_t> m_dirs_scanned;
    std::atomic<uint64_t> m_total_size;
    std::atomic<uint64_t> m_duplicates_found;
    std::atomic<uint64_t> m_skipped_files;
    std::string m_current_path;
    mutable std::mutex m_path_mutex;
    ProgressCallback m_callback;
    std::chrono::steady_clock::time_point m_start_time;
    int64_t m_next_id;

    // Track visited inodes to avoid counting hard links multiple times
    std::set<std::pair<uint64_t, uint64_t>> m_visited_inodes; // (dev, ino)
    std::mutex m_inode_mutex;
};
