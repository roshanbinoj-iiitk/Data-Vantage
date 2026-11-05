#include "paths.h"

#include <cerrno>
#include <cstdlib>
#include <pwd.h>
#include <sys/stat.h>
#include <unistd.h>

namespace
{
    std::string home_dir()
    {
        if (const char *home = std::getenv("HOME"); home && *home)
            return home;
        if (const passwd *pw = ::getpwuid(::getuid()); pw && pw->pw_dir)
            return pw->pw_dir;
        return "/tmp";
    }
} // namespace

bool make_dirs(const std::string &path, unsigned mode)
{
    if (path.empty())
        return false;
    for (size_t pos = 1; pos <= path.size(); ++pos)
    {
        if (pos != path.size() && path[pos] != '/')
            continue;
        const std::string part = path.substr(0, pos);
        if (::mkdir(part.c_str(), static_cast<mode_t>(mode)) != 0 && errno != EEXIST)
            return false;
    }
    struct stat st{};
    return ::stat(path.c_str(), &st) == 0 && S_ISDIR(st.st_mode);
}

std::string data_home_dir()
{
    if (const char *xdg = std::getenv("XDG_DATA_HOME"); xdg && *xdg == '/')
        return xdg;
    return home_dir() + "/.local/share";
}

std::string app_data_dir()
{
    std::string dir = data_home_dir() + "/data-vantage";
    make_dirs(dir, 0700);
    return dir;
}

std::string app_runtime_dir()
{
    if (const char *xdg = std::getenv("XDG_RUNTIME_DIR"); xdg && *xdg == '/')
    {
        std::string dir = std::string(xdg) + "/data-vantage";
        if (make_dirs(dir, 0700))
            return dir;
    }
    return app_data_dir();
}
