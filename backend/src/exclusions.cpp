#include "exclusions.h"

#include <algorithm>
#include <cctype>
#include <fnmatch.h>
#include <fstream>

namespace
{
    std::string to_lower(std::string s)
    {
        std::transform(s.begin(), s.end(), s.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        return s;
    }

    bool ends_with(const std::string &s, const std::string &suffix)
    {
        return s.size() >= suffix.size() && s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
    }

    bool starts_with(const std::string &s, const std::string &prefix)
    {
        return s.rfind(prefix, 0) == 0;
    }
} // namespace

ExclusionMatcher::ExclusionMatcher(std::vector<std::string> patterns) : m_patterns(std::move(patterns))
{
    for (const auto &raw : m_patterns)
    {
        std::string pat = to_lower(raw);
        if (pat.empty())
            continue;

        if (starts_with(pat, "**/") && ends_with(pat, "/**") && pat.size() > 6)
        {
            m_compiled.push_back({Pattern::Kind::Directory, pat.substr(3, pat.size() - 6)});
        }
        else if (ends_with(pat, "/**") && pat.size() > 3 && pat.find('*') == pat.size() - 2)
        {
            m_compiled.push_back({Pattern::Kind::Directory, pat.substr(0, pat.size() - 3)});
        }
        else if (pat.size() > 2 && pat[0] == '*' && pat[1] == '.' && pat.find_first_of("*/?[", 1) == std::string::npos)
        {
            m_compiled.push_back({Pattern::Kind::Extension, pat.substr(1)});
        }
        else if (pat.find_first_of("*/?[") == std::string::npos)
        {
            m_compiled.push_back({Pattern::Kind::Name, pat});
        }
        else if (starts_with(pat, "**/"))
        {
            m_compiled.push_back({Pattern::Kind::Glob, pat.substr(3)});
        }
        else
        {
            m_compiled.push_back({Pattern::Kind::Glob, pat});
        }
    }
}

bool ExclusionMatcher::excludes_directory(const std::string &rel_path, const std::string &name) const
{
    const std::string lname = to_lower(name);
    for (const auto &p : m_compiled)
    {
        switch (p.kind)
        {
        case Pattern::Kind::Name:
        case Pattern::Kind::Directory:
            // A multi-component directory pattern ("a/b/**") matches when the
            // relative path ends with it.
            if (p.text.find('/') == std::string::npos)
            {
                if (lname == p.text)
                    return true;
            }
            else
            {
                const std::string lrel = to_lower(rel_path);
                if (lrel == p.text || ends_with(lrel, "/" + p.text))
                    return true;
            }
            break;
        case Pattern::Kind::Glob:
            if (fnmatch(p.text.c_str(), lname.c_str(), 0) == 0 ||
                fnmatch(p.text.c_str(), to_lower(rel_path).c_str(), FNM_PATHNAME) == 0)
                return true;
            break;
        case Pattern::Kind::Extension:
            break;
        }
    }
    return false;
}

bool ExclusionMatcher::excludes_file(const std::string &rel_path, const std::string &name) const
{
    const std::string lname = to_lower(name);
    for (const auto &p : m_compiled)
    {
        switch (p.kind)
        {
        case Pattern::Kind::Name:
            if (lname == p.text)
                return true;
            break;
        case Pattern::Kind::Extension:
            if (ends_with(lname, p.text))
                return true;
            break;
        case Pattern::Kind::Glob:
            if (fnmatch(p.text.c_str(), lname.c_str(), 0) == 0 ||
                fnmatch(p.text.c_str(), to_lower(rel_path).c_str(), FNM_PATHNAME) == 0)
                return true;
            break;
        case Pattern::Kind::Directory:
            break; // directories are pruned during the walk
        }
    }
    return false;
}

const std::vector<std::string> &ExclusionMatcher::defaults()
{
    static const std::vector<std::string> patterns = {
        "node_modules/**", ".git/**", "__pycache__/**", "bower_components/**", "*.pyc", "*.o", "*.class"};
    return patterns;
}

bool looks_binary(const std::string &filepath)
{
    std::ifstream file(filepath, std::ios::binary);
    if (!file)
        return false;
    char buf[8192];
    file.read(buf, sizeof(buf));
    const auto bytes_read = file.gcount();
    if (bytes_read <= 0)
        return false;
    int non_text = 0;
    for (std::streamsize i = 0; i < bytes_read; i++)
    {
        const auto c = static_cast<unsigned char>(buf[i]);
        if (c == 0)
            return true;
        if (c < 7 || (c > 14 && c < 32 && c != 27))
            non_text++;
    }
    return static_cast<double>(non_text) / static_cast<double>(bytes_read) > 0.3;
}
