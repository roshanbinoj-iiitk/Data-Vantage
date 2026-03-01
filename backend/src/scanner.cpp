#include "scanner.h"
#include <filesystem>
#include <chrono>
#include <algorithm>
#include <sys/stat.h>

namespace fs = std::filesystem;

Scanner::Scanner()
    : m_scanning(false), m_stop_requested(false), m_files_scanned(0),
      m_dirs_scanned(0), m_total_size(0), m_duplicates_found(0),
      m_skipped_files(0), m_next_id(1)
{
}

Scanner::~Scanner()
{
    stop();
}

void Scanner::scan(const std::string &root_path, ProgressCallback callback, uint64_t min_size)
{
    if (m_scanning.load())
        return;

    m_scanning = true;
    m_stop_requested = false;

    // Reset all counters before each scan
    m_files_scanned = 0;
    m_dirs_scanned = 0;
    m_total_size = 0;
    m_duplicates_found = 0;
    m_skipped_files = 0;
    m_next_id = 1;
    m_callback = callback;
    m_min_size = min_size;
    m_start_time = std::chrono::steady_clock::now();

    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_files.clear();
    }

    {
        std::lock_guard<std::mutex> lock(m_inode_mutex);
        m_visited_inodes.clear();
    }

    {
        std::lock_guard<std::mutex> lock(m_path_mutex);
        m_current_path.clear();
    }

    // Add root entry
    FileEntry root;
    root.path = root_path;
    root.name = fs::path(root_path).filename().string();
    root.extension = "";
    root.size = 0;
    root.modified_time = 0;
    root.is_directory = true;
    root.parent_id = -1;
    root.id = 0;

    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_files.push_back(root);
    }

    scan_recursive(root_path, 0);

    m_scanning = false;

    if (m_callback)
    {
        m_callback(get_progress());
    }
}

void Scanner::scan_recursive(const std::string &path, int64_t parent_id)
{
    if (m_stop_requested.load())
        return;

    std::error_code ec;
    for (auto &entry : fs::directory_iterator(path, fs::directory_options::skip_permission_denied, ec))
    {
        if (m_stop_requested.load())
            return;

        try
        {
            // Skip symlinks entirely — they can cause double counting and
            // infinite loops with circular links.
            if (entry.is_symlink(ec))
            {
                m_skipped_files++;
                continue;
            }

            FileEntry fe;
            fe.path = entry.path().string();
            fe.name = entry.path().filename().string();
            fe.is_directory = entry.is_directory(ec);
            fe.parent_id = parent_id;

            if (fe.is_directory)
            {
                // Use stat to get the inode; skip if we already visited
                // this directory (possible via bind mounts).
                struct stat st;
                if (::stat(fe.path.c_str(), &st) == 0)
                {
                    auto key = std::make_pair(static_cast<uint64_t>(st.st_dev),
                                              static_cast<uint64_t>(st.st_ino));
                    std::lock_guard<std::mutex> lock(m_inode_mutex);
                    if (!m_visited_inodes.insert(key).second)
                    {
                        // Already visited this directory inode
                        m_skipped_files++;
                        continue;
                    }
                }

                fe.extension = "";
                fe.size = 0;
                fe.modified_time = 0;

                {
                    std::lock_guard<std::mutex> lock(m_mutex);
                    fe.id = m_next_id++;
                    m_files.push_back(fe);
                }

                m_dirs_scanned++;

                {
                    std::lock_guard<std::mutex> lock(m_path_mutex);
                    m_current_path = fe.path;
                }

                scan_recursive(fe.path, fe.id);
            }
            else if (entry.is_regular_file(ec))
            {
                // Use lstat to detect hard links — only count a file once
                // per unique (device, inode) pair.  lstat avoids following
                // symlinks (they are already skipped above).
                struct stat st;
                if (::lstat(fe.path.c_str(), &st) != 0)
                {
                    // Cannot stat file — permission error or race condition
                    m_skipped_files++;
                    continue;
                }

                auto key = std::make_pair(static_cast<uint64_t>(st.st_dev),
                                          static_cast<uint64_t>(st.st_ino));
                {
                    std::lock_guard<std::mutex> lock(m_inode_mutex);
                    if (!m_visited_inodes.insert(key).second)
                    {
                        // Hard link to an already-counted file — skip
                        m_skipped_files++;
                        continue;
                    }
                }

                fe.extension = entry.path().extension().string();
#ifdef __linux__
                // Actual disk consumption: st_blocks is in 512-byte units (POSIX).
                fe.size = static_cast<uint64_t>(st.st_blocks) * 512;
#else
                // Fallback: apparent file size on platforms without st_blocks.
                fe.size = static_cast<uint64_t>(st.st_size);
#endif
                // Exclude files smaller than minimum size threshold
                if (m_min_size > 0 && fe.size < m_min_size)
                {
                    m_skipped_files++;
                    continue;
                }
                auto ftime = entry.last_write_time(ec);
                if (!ec)
                {
                    fe.modified_time = std::chrono::duration_cast<std::chrono::seconds>(
                                           ftime.time_since_epoch())
                                           .count();
                }
                else
                {
                    fe.modified_time = static_cast<uint64_t>(st.st_mtime);
                }

                {
                    std::lock_guard<std::mutex> lock(m_mutex);
                    fe.id = m_next_id++;
                    m_files.push_back(fe);
                }

                m_files_scanned++;
                m_total_size += fe.size;

                // Report progress every 100 files
                if (m_callback && (m_files_scanned.load() % 100 == 0))
                {
                    m_callback(get_progress());
                }
            }
            // Ignore other file types (sockets, FIFOs, block devices, etc.)
        }
        catch (const fs::filesystem_error &)
        {
            // Permission denied or other filesystem error — skip gracefully
            m_skipped_files++;
            continue;
        }
        catch (const std::exception &)
        {
            // Any other error — skip gracefully
            m_skipped_files++;
            continue;
        }
    }

    if (ec)
    {
        // directory_iterator failed for this path (permission denied, etc.)
        m_skipped_files++;
    }
}

void Scanner::stop()
{
    m_stop_requested = true;
}

ScanProgress Scanner::get_progress() const
{
    ScanProgress progress;
    progress.files_scanned = m_files_scanned.load();
    progress.directories_scanned = m_dirs_scanned.load();
    progress.total_size = m_total_size.load();
    progress.duplicates_found = m_duplicates_found.load();
    progress.skipped_files = m_skipped_files.load();
    progress.is_scanning = m_scanning.load();

    {
        std::lock_guard<std::mutex> lock(m_path_mutex);
        progress.current_path = m_current_path;
    }

    auto now = std::chrono::steady_clock::now();
    progress.elapsed_seconds = std::chrono::duration<double>(now - m_start_time).count();

    // Compute files per second
    if (progress.elapsed_seconds > 0.1)
    {
        progress.files_per_second = static_cast<double>(progress.files_scanned) / progress.elapsed_seconds;
    }
    else
    {
        progress.files_per_second = 0.0;
    }

    // Estimated time remaining is unknown during the scanning phase
    // (we don't know total files), so set to -1.
    // The api_server will compute a meaningful ETA during hashing.
    progress.estimated_seconds_remaining = -1.0;

    return progress;
}

std::vector<FileEntry> Scanner::get_files() const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_files;
}

bool Scanner::is_scanning() const
{
    return m_scanning.load();
}
