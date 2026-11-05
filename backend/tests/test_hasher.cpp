#include <catch2/catch_test_macros.hpp>

#include "hasher.h"
#include "test_helpers.h"

TEST_CASE("hash_file is stable and content-sensitive")
{
    TempDir dir;
    const auto a = dir.file("a", "hello world");
    const auto b = dir.file("b", "hello world");
    const auto c = dir.file("c", "hello worle");

    REQUIRE(Hasher::hash_file(a).size() == 32);
    REQUIRE(Hasher::hash_file(a) == Hasher::hash_file(b));
    REQUIRE(Hasher::hash_file(a) != Hasher::hash_file(c));
    REQUIRE(Hasher::hash_file((dir.path / "missing").string()).empty());
}

TEST_CASE("hash_file covers content beyond the first chunk")
{
    TempDir dir;
    std::string big(3 * 1024 * 1024, 'x');
    const auto a = dir.file("a", big);
    big[2 * 1024 * 1024 + 7] = 'y';
    const auto b = dir.file("b", big);
    REQUIRE(Hasher::hash_file(a) != Hasher::hash_file(b));
    // The quick hash only looks at the ends, so it can't tell them apart.
    REQUIRE(Hasher::quick_hash(a, big.size()) == Hasher::quick_hash(b, big.size()));
}

TEST_CASE("files_identical compares byte by byte")
{
    TempDir dir;
    REQUIRE(Hasher::files_identical(dir.file("a", "same"), dir.file("b", "same")));
    REQUIRE_FALSE(Hasher::files_identical(dir.file("c", "same"), dir.file("d", "diff")));
    REQUIRE_FALSE(Hasher::files_identical(dir.file("e", "same"), dir.file("f", "same+")));
}
