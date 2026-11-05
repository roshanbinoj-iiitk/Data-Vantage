#include "file_actions.h"

#include "hasher.h"
#include "trash.h"

#include <cerrno>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <spawn.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>

extern char **environ;

namespace fs = std::filesystem;

namespace
{
    bool within(const std::string &path, const std::string &root)
    {
        if (path == root)
            return true;
        const std::string prefix = root.back() == '/' ? root : root + "/";
        return path.rfind(prefix, 0) == 0;
    }

    std::string canonical_or(const std::string &path)
    {
        std::error_code ec;
        auto c = fs::weakly_canonical(path, ec);
        return ec ? path : c.string();
    }

    // Runs argv without a shell and reaps it in the background.
    bool spawn_detached(const std::vector<std::string> &args)
    {
        std::vector<char *> argv;
        for (const auto &a : args)
            argv.push_back(const_cast<char *>(a.c_str()));
        argv.push_back(nullptr);
        pid_t pid;
        if (posix_spawnp(&pid, argv[0], nullptr, nullptr, argv.data(), environ) != 0)
            return false;
        std::thread([pid] {
            int status;
            waitpid(pid, &status, 0);
        }).detach();
        return true;
    }

    // Runs argv without a shell, waits, and reports whether it exited with 0.
    bool run_ok(const std::vector<std::string> &args)
    {
        std::vector<char *> argv;
        for (const auto &a : args)
            argv.push_back(const_cast<char *>(a.c_str()));
        argv.push_back(nullptr);
        pid_t pid;
        if (posix_spawnp(&pid, argv[0], nullptr, nullptr, argv.data(), environ) != 0)
            return false;
        int status = 0;
        waitpid(pid, &status, 0);
        return WIFEXITED(status) && WEXITSTATUS(status) == 0;
    }

    // Runs argv without a shell and returns its stdout (trimmed).
    std::string capture(const std::vector<std::string> &args)
    {
        int fds[2];
        if (pipe(fds) != 0)
            return "";
        posix_spawn_file_actions_t actions;
        posix_spawn_file_actions_init(&actions);
        posix_spawn_file_actions_adddup2(&actions, fds[1], STDOUT_FILENO);
        posix_spawn_file_actions_addclose(&actions, fds[0]);
        posix_spawn_file_actions_addopen(&actions, STDERR_FILENO, "/dev/null", O_WRONLY, 0);

        std::vector<char *> argv;
        for (const auto &a : args)
            argv.push_back(const_cast<char *>(a.c_str()));
        argv.push_back(nullptr);

        pid_t pid;
        const int rc = posix_spawnp(&pid, argv[0], &actions, nullptr, argv.data(), environ);
        posix_spawn_file_actions_destroy(&actions);
        close(fds[1]);
        std::string out;
        if (rc == 0)
        {
            char buf[4096];
            ssize_t n;
            while ((n = read(fds[0], buf, sizeof(buf))) > 0)
                out.append(buf, static_cast<size_t>(n));
            int status;
            waitpid(pid, &status, 0);
            if (!WIFEXITED(status) || WEXITSTATUS(status) != 0)
                out.clear();
        }
        close(fds[0]);
        while (!out.empty() && (out.back() == '\n' || out.back() == '\r'))
            out.pop_back();
        return out;
    }
} // namespace

bool unchanged_since_scan(const FileEntry &entry, std::string &reason)
{
    struct stat st{};
    if (::lstat(entry.path.c_str(), &st) != 0)
    {
        reason = std::strerror(errno);
        return false;
    }
    if (!S_ISREG(st.st_mode))
    {
        reason = "no longer a regular file";
        return false;
    }
    if (static_cast<uint64_t>(st.st_size) != entry.size || static_cast<int64_t>(st.st_mtime) != entry.modified_time)
    {
        reason = "changed since the scan; run a new scan first";
        return false;
    }
    return true;
}

TrashOutcome trash_scanned_files(const ScanResult &scan, const std::vector<FileEntry> &entries,
                                 const FileEntry *identical_to)
{
    TrashOutcome out;
    const std::string root = canonical_or(scan.root_path);

    for (const auto &entry : entries)
    {
        if (entry.is_directory)
        {
            out.failed.emplace_back(entry.path, "folders can't be deleted here");
            continue;
        }
        if (!within(canonical_or(entry.path), root))
        {
            out.failed.emplace_back(entry.path, "outside the scanned folder");
            continue;
        }

        struct stat st{};
        if (::lstat(entry.path.c_str(), &st) != 0 && errno == ENOENT)
        {
            // Already gone: just forget it.
            out.trashed.push_back(entry.path);
            out.removed_ids.push_back(entry.id);
            continue;
        }

        std::string reason;
        if (!unchanged_since_scan(entry, reason))
        {
            out.failed.emplace_back(entry.path, reason);
            continue;
        }
        if (identical_to && !Hasher::files_identical(identical_to->path, entry.path))
        {
            out.failed.emplace_back(entry.path, "no longer identical to the kept file");
            continue;
        }
        if (!move_to_trash(entry.path, reason))
        {
            out.failed.emplace_back(entry.path, reason);
            continue;
        }
        out.trashed.push_back(entry.path);
        out.removed_ids.push_back(entry.id);
    }
    return out;
}

bool open_with_default_app(const std::string &path)
{
#ifdef __APPLE__
    return spawn_detached({"open", path});
#else
    return spawn_detached({"xdg-open", path});
#endif
}

bool reveal_in_file_manager(const std::string &path)
{
#ifdef __APPLE__
    return spawn_detached({"open", "-R", path});
#else
    const std::string uri = "file://" + trash_encode_path(path);
    if (run_ok({"dbus-send", "--session", "--print-reply", "--dest=org.freedesktop.FileManager1", "--type=method_call",
                "/org/freedesktop/FileManager1", "org.freedesktop.FileManager1.ShowItems", "array:string:" + uri,
                "string:"}))
        return true;
    return spawn_detached({"xdg-open", fs::path(path).parent_path().string()});
#endif
}

std::string pick_directory()
{
    std::string picked;
#ifdef __APPLE__
    picked = capture({"osascript", "-e", "POSIX path of (choose folder with prompt \"Select folder to scan\")"});
#endif
    if (picked.empty())
        picked = capture({"kdialog", "--getexistingdirectory"});
    if (picked.empty())
        picked = capture({"zenity", "--file-selection", "--directory", "--title=Select folder to scan"});
    return picked;
}
