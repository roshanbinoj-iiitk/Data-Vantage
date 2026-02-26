#include "scanner.h"
#include <filesystem>
#include <chrono>
#include <algorithm>

namespace fs = std::filesystem;

Scanner::Scanner()
    : m_scanning(false), m_stop_requested(false), m_files_scanned(0), m_dirs_scanned(0), m_total_size(0), m_duplicates_found(0), m_next_id(1)
{
}

Scanner::~Scanner()
{
    stop();
}

void Scanner::scan(const std::string &root_path, ProgressCallback callback)
{
    if (m_scanning.load())
        return;

    m_scanning = true;
    m_stop_requested = false;
    m_files_scanned = 0;
    m_dirs_scanned = 0;
    m_total_size = 0;
    m_duplicates_found = 0;
    m_next_id = 1;
    m_callback = callback;
    m_start_time = std::chrono::steady_clock::now();

    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_files.clear();
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
            FileEntry fe;
            fe.path = entry.path().string();
            fe.name = entry.path().filename().string();
            fe.is_directory = entry.is_directory(ec);
            fe.parent_id = parent_id;

            if (fe.is_directory)
            {
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
                fe.extension = entry.path().extension().string();
                fe.size = entry.file_size(ec);
                auto ftime = entry.last_write_time(ec);
                fe.modified_time = std::chrono::duration_cast<std::chrono::seconds>(
                                       ftime.time_since_epoch())
                                       .count();

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
        }
        catch (const std::exception &)
        {
            // Skip files we can't access
            continue;
        }
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
    progress.is_scanning = m_scanning.load();

    {
        std::lock_guard<std::mutex> lock(m_path_mutex);
        progress.current_path = m_current_path;
    }

    auto now = std::chrono::steady_clock::now();
    progress.elapsed_seconds = std::chrono::duration<double>(now - m_start_time).count();

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
