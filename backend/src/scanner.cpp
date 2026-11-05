#include "scanner.h"

#include <cerrno>
#include <dirent.h>
#include <sys/stat.h>

namespace
{
    std::string join(const std::string &dir, const std::string &name)
    {
        if (!dir.empty() && dir.back() == '/')
            return dir + name;
        return dir + "/" + name;
    }

    std::string extension_of(const std::string &name)
    {
        // Same rules as std::filesystem::path::extension(): a leading dot
        // ("dotfile") is not an extension.
        auto pos = name.rfind('.');
        if (pos == std::string::npos || pos == 0)
            return "";
        return name.substr(pos);
    }
} // namespace

void Scanner::scan(const std::string &root_path, const ScanOptions &options, const ProgressCallback &callback)
{
    if (m_scanning.exchange(true))
        return;

    m_stop_requested = false;
    m_files_scanned = 0;
    m_dirs_scanned = 0;
    m_total_size = 0;
    m_skipped_files = 0;
    m_start_time = std::chrono::steady_clock::now();
    m_files.clear();
    m_visited_inodes.clear();
    {
        std::lock_guard<std::mutex> lock(m_path_mutex);
        m_current_path = root_path;
    }

    FileEntry root;
    root.id = 0;
    root.parent_id = -1;
    root.name = root_path;
    root.path = root_path;
    root.is_directory = true;
    struct stat root_st{};
    if (::stat(root_path.c_str(), &root_st) == 0)
    {
        m_visited_inodes.insert({static_cast<uint64_t>(root_st.st_dev), static_cast<uint64_t>(root_st.st_ino)});
        root.modified_time = static_cast<int64_t>(root_st.st_mtime);
    }
    m_files.push_back(root);

    // Explicit stack instead of recursion: deep trees can't overflow the
    // call stack. Holds indices into m_files.
    std::vector<size_t> pending{0};
    const std::string root_prefix = root_path.back() == '/' ? root_path : root_path + "/";

    while (!pending.empty() && !m_stop_requested.load())
    {
        const size_t dir_index = pending.back();
        pending.pop_back();
        const std::string dir_path = m_files[dir_index].path;
        const int64_t dir_id = m_files[dir_index].id;

        {
            std::lock_guard<std::mutex> lock(m_path_mutex);
            m_current_path = dir_path;
        }

        DIR *dir = ::opendir(dir_path.c_str());
        if (!dir)
        {
            m_skipped_files++;
            continue;
        }

        std::vector<size_t> children_dirs;
        while (!m_stop_requested.load())
        {
            errno = 0;
            dirent *de = ::readdir(dir);
            if (!de)
                break;
            const std::string name = de->d_name;
            if (name == "." || name == "..")
                continue;

            const std::string path = join(dir_path, name);
            struct stat st{};
            if (::lstat(path.c_str(), &st) != 0)
            {
                m_skipped_files++;
                continue;
            }

            // Symlinks are skipped: they cause double counting and loops.
            if (S_ISLNK(st.st_mode))
            {
                m_skipped_files++;
                continue;
            }

            const std::string rel = path.size() > root_prefix.size() ? path.substr(root_prefix.size()) : name;
            const auto key = std::make_pair(static_cast<uint64_t>(st.st_dev), static_cast<uint64_t>(st.st_ino));

            if (S_ISDIR(st.st_mode))
            {
                if (options.exclusions.excludes_directory(rel, name))
                    continue;
                // Bind mounts can expose the same directory twice.
                if (!m_visited_inodes.insert(key).second)
                {
                    m_skipped_files++;
                    continue;
                }

                FileEntry fe;
                fe.id = static_cast<int64_t>(m_files.size());
                fe.parent_id = dir_id;
                fe.name = name;
                fe.path = path;
                fe.is_directory = true;
                fe.modified_time = static_cast<int64_t>(st.st_mtime);
                children_dirs.push_back(m_files.size());
                m_files.push_back(std::move(fe));
                m_dirs_scanned++;
            }
            else if (S_ISREG(st.st_mode))
            {
                if (options.exclusions.excludes_file(rel, name))
                    continue;
                // Hard links: count each (device, inode) once.
                if (st.st_nlink > 1 && !m_visited_inodes.insert(key).second)
                {
                    m_skipped_files++;
                    continue;
                }

                const auto apparent = static_cast<uint64_t>(st.st_size);
                if (options.min_size > 0 && apparent < options.min_size)
                {
                    m_skipped_files++;
                    continue;
                }

                FileEntry fe;
                fe.id = static_cast<int64_t>(m_files.size());
                fe.parent_id = dir_id;
                fe.name = name;
                fe.path = path;
                fe.extension = extension_of(name);
                fe.size = apparent;
                fe.disk_size = static_cast<uint64_t>(st.st_blocks) * 512;
                fe.modified_time = static_cast<int64_t>(st.st_mtime);
                m_files.push_back(std::move(fe));

                m_total_size += static_cast<uint64_t>(st.st_blocks) * 512;
                if ((++m_files_scanned % 1000) == 0 && callback)
                    callback(get_progress());
            }
        }
        if (errno != 0)
            m_skipped_files++;
        ::closedir(dir);

        // Push in reverse so directories are visited in readdir order.
        for (auto it = children_dirs.rbegin(); it != children_dirs.rend(); ++it)
            pending.push_back(*it);
    }

    // The inode set can be large; don't keep it around after the walk.
    decltype(m_visited_inodes)().swap(m_visited_inodes);
    m_scanning = false;
    if (callback)
        callback(get_progress());
}

ScanProgress Scanner::get_progress() const
{
    ScanProgress progress;
    progress.files_scanned = m_files_scanned.load();
    progress.directories_scanned = m_dirs_scanned.load();
    progress.total_size = m_total_size.load();
    progress.skipped_files = m_skipped_files.load();
    progress.is_scanning = m_scanning.load();
    {
        std::lock_guard<std::mutex> lock(m_path_mutex);
        progress.current_path = m_current_path;
    }
    progress.elapsed_seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - m_start_time).count();
    progress.files_per_second =
        progress.elapsed_seconds > 0.1 ? static_cast<double>(progress.files_scanned) / progress.elapsed_seconds : 0.0;
    progress.estimated_seconds_remaining = -1.0; // unknown while walking
    return progress;
}
