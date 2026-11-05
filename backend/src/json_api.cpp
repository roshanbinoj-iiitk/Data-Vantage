#include "json_api.h"

using nlohmann::json;

json to_json(const FileEntry &f)
{
    return {
        {"id", f.id},
        {"parentId", f.parent_id},
        {"path", f.path},
        {"name", f.name},
        {"extension", f.extension},
        {"size", f.size},
        {"sizeOnDisk", f.disk_size},
        {"modifiedTime", f.modified_time},
        {"isDirectory", f.is_directory},
        {"hash", f.hash},
    };
}

json to_json(const ScanResult &r)
{
    return {
        {"scanId", r.scan_id},
        {"rootPath", r.root_path},
        {"totalFiles", r.total_files},
        {"totalDirectories", r.total_directories},
        {"totalSize", r.total_size},
        {"duplicateGroups", r.duplicate_groups},
        {"duplicateFiles", r.duplicate_files},
        {"wastedSpace", r.wasted_space},
        {"scanDate", r.scan_date},
        {"scanDuration", r.scan_duration},
        {"status", r.status.empty() ? "completed" : r.status},
        {"exclusions", r.exclusions},
        {"minSize", r.min_size},
    };
}

json to_json(const ScanProgress &p, const std::string &status)
{
    return {
        {"filesScanned", p.files_scanned},
        {"directoriesScanned", p.directories_scanned},
        {"totalSize", p.total_size},
        {"duplicatesFound", p.duplicates_found},
        {"skippedFiles", p.skipped_files},
        {"isScanning", p.is_scanning},
        {"currentPath", p.current_path},
        {"elapsedSeconds", p.elapsed_seconds},
        {"estimatedSecondsRemaining", p.estimated_seconds_remaining},
        {"filesPerSecond", p.files_per_second},
        {"status", status},
    };
}

json to_json(const DuplicateGroup &g)
{
    json files = json::array();
    for (const auto &f : g.files)
        files.push_back(to_json(f));
    return {
        {"groupId", g.id},
        {"hash", g.hash},
        {"fileSize", g.file_size},
        {"wastedSpace", g.wasted_space},
        {"fileCount", g.files.size()},
        {"files", std::move(files)},
    };
}

json to_json(const FileTypeStats &s)
{
    return {{"extension", s.extension}, {"count", s.count}, {"totalSize", s.total_size}};
}
