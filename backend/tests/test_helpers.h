#pragma once

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <string>

// A temporary directory removed when the test ends.
struct TempDir
{
    std::filesystem::path path;
    TempDir()
    {
        std::string tmpl = (std::filesystem::temp_directory_path() / "dv-test-XXXXXX").string();
        path = mkdtemp(tmpl.data());
    }
    ~TempDir()
    {
        std::error_code ec;
        std::filesystem::remove_all(path, ec);
    }
    std::string file(const std::string &rel, const std::string &content) const
    {
        auto p = path / rel;
        std::filesystem::create_directories(p.parent_path());
        std::ofstream(p, std::ios::binary) << content;
        return p.string();
    }
};
