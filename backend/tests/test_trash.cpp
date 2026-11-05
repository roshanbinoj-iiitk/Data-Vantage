#include <catch2/catch_test_macros.hpp>

#include "test_helpers.h"
#include "trash.h"

#include <cstdlib>
#include <fstream>
#include <sstream>

TEST_CASE("trash paths are percent-encoded")
{
    REQUIRE(trash_encode_path("/a b/c%d.txt") == "/a%20b/c%25d.txt");
}

TEST_CASE("move_to_trash moves the file and writes .trashinfo")
{
    TempDir dir;
    // Point the home trash into the temp dir (same file system).
    setenv("XDG_DATA_HOME", (dir.path / "share").c_str(), 1);
    std::filesystem::create_directories(dir.path / "share");
    const auto f1 = dir.file("docs/report.txt", "1");
    const auto f2 = dir.file("other/report.txt", "2");

    std::string err;
    REQUIRE(move_to_trash(f1, err));
    REQUIRE(move_to_trash(f2, err));
    REQUIRE_FALSE(std::filesystem::exists(f1));

    const auto trash = dir.path / "share" / "Trash";
    REQUIRE(std::filesystem::exists(trash / "files" / "report.txt"));
    REQUIRE(std::filesystem::exists(trash / "files" / "report.txt.1"));
    std::ifstream info(trash / "info" / "report.txt.trashinfo");
    std::stringstream ss;
    ss << info.rdbuf();
    REQUIRE(ss.str().find("Path=" + trash_encode_path(f1)) != std::string::npos);

    REQUIRE_FALSE(move_to_trash((dir.path / "missing").string(), err));
    unsetenv("XDG_DATA_HOME");
}
