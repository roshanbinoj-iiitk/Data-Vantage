#pragma once

#include <string>
#include <vector>
#include <memory>
#include <cstdint>
#include "scanner.h"

struct DuplicateGroup
{
    std::string hash;
    uint64_t file_size;
    uint64_t wasted_space;
    std::vector<FileEntry> files;
};

struct ScanResult
{
    int64_t scan_id;
    std::string root_path;
    uint64_t total_files;
    uint64_t total_directories;
    uint64_t total_size;
    uint64_t duplicate_groups;
    uint64_t duplicate_files;
    uint64_t wasted_space;
    std::string scan_date;
    double scan_duration;
};

struct FileTypeStats
{
    std::string extension;
    uint64_t count;
    uint64_t total_size;
};

class Database
{
public:
    Database(const std::string &db_path = "data_vantage.db");
    ~Database();

    // Initialize tables
    void initialize();

    // Scan operations
    int64_t create_scan(const std::string &root_path);
    void complete_scan(int64_t scan_id, const ScanResult &result);
    ScanResult get_scan(int64_t scan_id);
    std::vector<ScanResult> get_all_scans();
    void delete_scan(int64_t scan_id);

    // File operations
    void insert_files(int64_t scan_id, const std::vector<FileEntry> &files);
    std::vector<FileEntry> get_files(int64_t scan_id, int64_t parent_id = -1, int limit = 100, int offset = 0);
    std::vector<FileEntry> search_files(int64_t scan_id, const std::string &query);
    void delete_files_by_paths(int64_t scan_id, const std::vector<std::string> &paths);

    // Duplicate operations
    void store_duplicates(int64_t scan_id, const std::vector<DuplicateGroup> &groups);
    std::vector<DuplicateGroup> get_duplicates(int64_t scan_id, int limit = 50, int offset = 0);
    uint64_t get_duplicate_count(int64_t scan_id);
    void delete_duplicate_group(int64_t scan_id, const std::string &hash, const std::string &keep_path);

    // Statistics
    std::vector<FileTypeStats> get_file_type_stats(int64_t scan_id);
    uint64_t get_total_size(int64_t scan_id);

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};
