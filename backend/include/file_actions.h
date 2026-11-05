#pragma once

#include <string>
#include <utility>
#include <vector>

#include "database.h"

struct TrashOutcome
{
    std::vector<std::string> trashed;                        // paths moved to the trash (or already gone)
    std::vector<std::pair<std::string, std::string>> failed; // (path, reason)
    std::vector<int64_t> removed_ids;                        // ids to drop from the scan
};

// Moves scanned files to the trash after checking, for each one, that it is
// still a regular file inside the scan root with the size and modification
// time recorded by the scan. When `identical_to` is set, each file must also
// still match that file byte for byte.
TrashOutcome trash_scanned_files(const ScanResult &scan, const std::vector<FileEntry> &entries,
                                 const FileEntry *identical_to = nullptr);

// True if `entry` on disk still has the size and mtime recorded by the scan.
// `reason` is set when it doesn't.
bool unchanged_since_scan(const FileEntry &entry, std::string &reason);

// Opens a file with the desktop's default application.
bool open_with_default_app(const std::string &path);
// Shows a file selected in the desktop's file manager.
bool reveal_in_file_manager(const std::string &path);
// Shows a native folder picker (kdialog/zenity/osascript). "" if unavailable or cancelled.
std::string pick_directory();
