#pragma once

#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "scanner.h"

struct DuplicateGroup
{
    int64_t id = 0;
    std::string hash;
    uint64_t file_size = 0;    // apparent size of each copy
    uint64_t wasted_space = 0; // disk space freed by keeping only one copy
    std::vector<FileEntry> files;
};

struct ScanResult
{
    int64_t scan_id = 0;
    std::string root_path;
    uint64_t total_files = 0;
    uint64_t total_directories = 0;
    uint64_t total_size = 0;
    uint64_t duplicate_groups = 0;
    uint64_t duplicate_files = 0; // files that belong to a duplicate group
    uint64_t wasted_space = 0;
    std::string scan_date;
    double scan_duration = 0;
    std::string status; // running | completed | cancelled | failed
    std::vector<std::string> exclusions;
    uint64_t min_size = 0;
};

struct FileTypeStats
{
    std::string extension;
    uint64_t count = 0;
    uint64_t total_size = 0;
};

enum class SortOrder
{
    Asc,
    Desc
};

struct FileQuery
{
    int64_t parent_id = 0;
    std::string sort = "name"; // name | size | extension | modified
    SortOrder order = SortOrder::Asc;
    int limit = 100;
    int offset = 0;
};

struct DuplicateQuery
{
    std::string sort = "wasted"; // wasted | size | count | name | path
    SortOrder order = SortOrder::Desc;
    std::string filter; // substring of a member's path (case-insensitive)
    int limit = 50;
    int offset = 0;
};

template <typename T> struct Page
{
    uint64_t total = 0;
    std::vector<T> items;
};

class DbError : public std::runtime_error
{
  public:
    using std::runtime_error::runtime_error;
};

class Database
{
  public:
    explicit Database(const std::string &db_path);
    ~Database();
    Database(const Database &) = delete;
    Database &operator=(const Database &) = delete;

    // Scans
    int64_t create_scan(const std::string &root_path, const std::vector<std::string> &exclusions, uint64_t min_size);
    void complete_scan(const ScanResult &result);
    void set_scan_status(int64_t scan_id, const std::string &status);
    std::optional<ScanResult> get_scan(int64_t scan_id);
    std::vector<ScanResult> get_all_scans();
    void delete_scan(int64_t scan_id);
    // Scans left "running" by a previous process can never finish.
    void mark_interrupted_scans();

    // Files. Entries must be ordered parent-before-child; directory sizes are
    // expected to be already summed.
    void insert_files(int64_t scan_id, const std::vector<FileEntry> &files);
    Page<FileEntry> get_files(int64_t scan_id, const FileQuery &query);
    std::optional<FileEntry> get_file(int64_t scan_id, int64_t file_id);
    std::vector<FileEntry> get_ancestors(int64_t scan_id, int64_t file_id);
    std::vector<FileEntry> search_files(int64_t scan_id, const std::string &query, int limit = 100);

    // Removes files (not directories) from the scan, updating folder sizes,
    // scan totals and duplicate groups. Returns the number of rows removed.
    size_t remove_files(int64_t scan_id, const std::vector<int64_t> &file_ids);

    // Duplicates
    void store_duplicates(int64_t scan_id, const std::vector<DuplicateGroup> &groups);
    Page<DuplicateGroup> get_duplicates(int64_t scan_id, const DuplicateQuery &query);
    std::optional<DuplicateGroup> get_duplicate_group(int64_t scan_id, int64_t group_id);

    // Statistics
    std::vector<FileTypeStats> get_file_type_stats(int64_t scan_id);

    bool has_fts() const;

  private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
    std::mutex m_mutex;
};
