#include <catch2/catch_test_macros.hpp>

#include "exclusions.h"

TEST_CASE("directory patterns prune anywhere in the tree")
{
    ExclusionMatcher m({"node_modules/**", "**/.git/**", "a/b/**"});
    REQUIRE(m.excludes_directory("node_modules", "node_modules"));
    REQUIRE(m.excludes_directory("src/app/node_modules", "node_modules"));
    REQUIRE(m.excludes_directory("x/.git", ".git"));
    REQUIRE(m.excludes_directory("x/a/b", "b"));
    REQUIRE_FALSE(m.excludes_directory("x/b", "b"));
    REQUIRE_FALSE(m.excludes_directory("node_modules_old", "node_modules_old"));
    // Directory patterns never exclude files.
    REQUIRE_FALSE(m.excludes_file("node_modules", "node_modules"));
}

TEST_CASE("file patterns")
{
    ExclusionMatcher m({"*.PYC", "Thumbs.db", "**/*.tmp", "logs/*.log"});
    REQUIRE(m.excludes_file("a/b/c.pyc", "c.pyc"));
    REQUIRE(m.excludes_file("thumbs.db", "thumbs.db"));
    REQUIRE(m.excludes_file("deep/x.tmp", "x.tmp"));
    REQUIRE(m.excludes_file("logs/today.log", "today.log"));
    REQUIRE_FALSE(m.excludes_file("other/today.log", "today.log"));
    REQUIRE_FALSE(m.excludes_file("c.py", "c.py"));
}
