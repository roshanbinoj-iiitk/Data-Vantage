#include "trash.h"

#include "paths.h"

#include <cctype>
#include <cerrno>
#include <cstring>
#include <ctime>
#include <fcntl.h>
#include <string>
#include <sys/stat.h>
#include <unistd.h>

namespace
{
    bool ensure_dir(const std::string &path, mode_t mode)
    {
        if (::mkdir(path.c_str(), mode) == 0)
            return true;
        if (errno != EEXIST)
            return false;
        struct stat st{};
        return ::lstat(path.c_str(), &st) == 0 && S_ISDIR(st.st_mode);
    }

    std::string basename_of(const std::string &path)
    {
        auto pos = path.find_last_of('/');
        return pos == std::string::npos ? path : path.substr(pos + 1);
    }

    std::string dirname_of(const std::string &path)
    {
        auto pos = path.find_last_of('/');
        if (pos == std::string::npos)
            return ".";
        if (pos == 0)
            return "/";
        return path.substr(0, pos);
    }

    // Top directory of the mount that contains `path`.
    std::string mount_top(const std::string &path)
    {
        struct stat st{};
        if (::lstat(path.c_str(), &st) != 0)
            return "";
        const dev_t dev = st.st_dev;
        std::string current = dirname_of(path);
        while (current != "/")
        {
            const std::string parent = dirname_of(current);
            struct stat pst{};
            if (::stat(parent.c_str(), &pst) != 0 || pst.st_dev != dev)
                break;
            current = parent;
        }
        return current;
    }

    std::string deletion_date()
    {
        std::time_t now = std::time(nullptr);
        std::tm local{};
        localtime_r(&now, &local);
        char buf[32];
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &local);
        return buf;
    }

    // Tries to trash `path` into `trash_dir` (which has files/ and info/).
    // `info_path_value` is the Path= value to record.
    bool trash_into(const std::string &path, const std::string &trash_dir, const std::string &info_path_value,
                    std::string &error)
    {
        const std::string files_dir = trash_dir + "/files";
        const std::string info_dir = trash_dir + "/info";
        if (!ensure_dir(trash_dir, 0700) || !ensure_dir(files_dir, 0700) || !ensure_dir(info_dir, 0700))
        {
            error = "cannot create trash folder " + trash_dir;
            return false;
        }

        const std::string base = basename_of(path);
        const std::string info_body =
            "[Trash Info]\nPath=" + trash_encode_path(info_path_value) + "\nDeletionDate=" + deletion_date() + "\n";

        for (int attempt = 0; attempt < 1000; ++attempt)
        {
            const std::string name = attempt == 0 ? base : base + "." + std::to_string(attempt);
            const std::string info_file = info_dir + "/" + name + ".trashinfo";

            // Creating the info file with O_EXCL reserves the name.
            int fd = ::open(info_file.c_str(), O_WRONLY | O_CREAT | O_EXCL, 0600);
            if (fd < 0)
            {
                if (errno == EEXIST)
                    continue;
                error = "cannot write " + info_file + ": " + std::strerror(errno);
                return false;
            }
            const ssize_t written = ::write(fd, info_body.data(), info_body.size());
            ::close(fd);
            if (written != static_cast<ssize_t>(info_body.size()))
            {
                ::unlink(info_file.c_str());
                error = "cannot write " + info_file;
                return false;
            }

            const std::string target = files_dir + "/" + name;
            struct stat existing{};
            if (::lstat(target.c_str(), &existing) == 0)
            {
                ::unlink(info_file.c_str());
                continue;
            }
            if (::rename(path.c_str(), target.c_str()) == 0)
                return true;

            const int err = errno;
            ::unlink(info_file.c_str());
            error = std::strerror(err);
            errno = err;
            return false;
        }
        error = "too many files with the same name in the trash";
        return false;
    }
} // namespace

std::string trash_encode_path(const std::string &path)
{
    static const char hex[] = "0123456789ABCDEF";
    std::string out;
    for (unsigned char c : path)
    {
        if (std::isalnum(c) || c == '/' || c == '-' || c == '_' || c == '.' || c == '~')
        {
            out += static_cast<char>(c);
        }
        else
        {
            out += '%';
            out += hex[c >> 4];
            out += hex[c & 0xF];
        }
    }
    return out;
}

bool move_to_trash(const std::string &path, std::string &error)
{
    struct stat st{};
    if (::lstat(path.c_str(), &st) != 0)
    {
        error = std::strerror(errno);
        return false;
    }

    // 1. Home trash.
    const std::string home_trash = data_home_dir() + "/Trash";
    ensure_dir(data_home_dir(), 0700);
    struct stat home_st{};
    if (::stat(data_home_dir().c_str(), &home_st) == 0 && home_st.st_dev == st.st_dev)
        return trash_into(path, home_trash, path, error);

    // 2. Per-mount trash: $topdir/.Trash-$uid with a path relative to topdir.
    const std::string top = mount_top(path);
    if (top.empty())
    {
        error = "cannot find the mount point for " + path;
        return false;
    }
    const std::string top_trash = (top == "/" ? "" : top) + "/.Trash-" + std::to_string(::getuid());
    std::string relative = path.substr(top == "/" ? 1 : top.size() + 1);
    if (trash_into(path, top_trash, relative, error))
        return true;

    // 3. Last resort: the home trash, if rename across devices happens to
    // work (it won't for a real cross-device move). Never fall back to a
    // permanent delete.
    std::string home_error;
    if (trash_into(path, home_trash, path, home_error))
        return true;
    error = "could not move to trash (" + error + ")";
    return false;
}
