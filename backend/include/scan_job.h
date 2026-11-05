#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

#include "database.h"
#include "scanner.h"

struct ScanJobOptions
{
    ScanOptions scan;
    // Leave extensionless files that look binary out of duplicate detection.
    // Off by default because it means opening each candidate.
    bool skip_extensionless_binaries = false;
    unsigned hash_threads = 0; // 0 = pick automatically
};

// One scan: walk the tree, hash duplicate candidates, store the results.
// run() executes on a worker thread; everything else is thread-safe.
class ScanJob
{
  public:
    ScanJob(int64_t scan_id, std::string root, ScanJobOptions options);

    void run(Database &db);

    // Stops the walk and the hashing. A cancelled scan stores nothing and is
    // marked "cancelled".
    void cancel();
    // Like cancel(), but also removes every trace of the scan from the
    // database once the worker is done writing.
    void cancel_and_delete();

    bool finished() const { return m_finished.load(); }
    int64_t scan_id() const { return m_scan_id; }

    // Progress for the API; status is scanning | hashing | saving |
    // completed | cancelled | failed.
    ScanProgress progress(std::string &status) const;

    // Hashes candidate groups and returns confirmed duplicate groups. Public
    // for tests. `files` must have entry i at index i.
    static std::vector<DuplicateGroup> find_duplicates(std::vector<FileEntry> &files, const ScanJobOptions &options,
                                                       const std::atomic<bool> &cancel,
                                                       std::atomic<uint64_t> *done = nullptr,
                                                       std::atomic<uint64_t> *total = nullptr);

    // Adds every entry's sizes to its ancestors. Entries must be ordered
    // parent-before-child with entry i at index i.
    static void sum_directory_sizes(std::vector<FileEntry> &files);

  private:
    void set_status(const std::string &status);

    const int64_t m_scan_id;
    const std::string m_root;
    const ScanJobOptions m_options;
    Scanner m_scanner;

    std::atomic<bool> m_cancel{false};
    std::atomic<bool> m_delete{false};
    std::atomic<bool> m_finished{false};

    mutable std::mutex m_mutex;
    std::string m_status = "scanning";
    ScanProgress m_walk_progress; // final walk numbers, once walking is done
    uint64_t m_duplicates_found = 0;

    const std::chrono::steady_clock::time_point m_start = std::chrono::steady_clock::now();
    std::chrono::steady_clock::time_point m_hash_start{};
    std::atomic<uint64_t> m_hash_total{0};
    std::atomic<uint64_t> m_hash_done{0};
};
