#include <catch2/catch_test_macros.hpp>

#include "scan_job.h"
#include "scanner.h"
#include "test_helpers.h"

#include <unistd.h>

TEST_CASE("scanner walks iteratively, skips symlinks, hard links and exclusions")
{
    TempDir dir;
    dir.file("a.txt", "aaaa");
    dir.file("sub/b.txt", "bb");
    dir.file("sub/deeper/c.txt", "c");
    dir.file("node_modules/pkg/index.js", "x");
    std::filesystem::create_symlink(dir.path / "a.txt", dir.path / "link");
    REQUIRE(::link((dir.path / "a.txt").c_str(), (dir.path / "hard").c_str()) == 0);

    Scanner scanner;
    ScanOptions opts;
    opts.exclusions = ExclusionMatcher({"node_modules/**"});
    scanner.scan(dir.path.string(), opts);
    auto files = scanner.take_files();

    size_t regular = 0;
    for (size_t i = 0; i < files.size(); ++i)
    {
        REQUIRE(files[i].id == static_cast<int64_t>(i));
        if (i > 0)
            REQUIRE(files[i].parent_id < files[i].id); // parents first
        REQUIRE(files[i].name != "node_modules");
        if (!files[i].is_directory)
            ++regular;
    }
    REQUIRE(regular == 3); // a.txt (once), b.txt, c.txt
    REQUIRE(scanner.get_progress().skipped_files >= 2);
}

TEST_CASE("directory sizes are summed bottom-up")
{
    std::vector<FileEntry> files(4);
    for (int i = 0; i < 4; ++i)
        files[i].id = i;
    files[0].parent_id = -1;
    files[0].is_directory = true;
    files[1].parent_id = 0;
    files[1].is_directory = true;
    files[2].parent_id = 1;
    files[2].disk_size = 4096;
    files[3].parent_id = 0;
    files[3].disk_size = 8192;
    ScanJob::sum_directory_sizes(files);
    REQUIRE(files[1].disk_size == 4096);
    REQUIRE(files[0].disk_size == 12288);
}

TEST_CASE("duplicates are grouped by content, not just size")
{
    TempDir dir;
    dir.file("x1", "duplicate content");
    dir.file("sub/x2", "duplicate content");
    dir.file("y", "different content"); // same length
    dir.file("z", "short");

    Scanner scanner;
    scanner.scan(dir.path.string(), ScanOptions{});
    auto files = scanner.take_files();
    std::atomic<bool> cancel{false};
    ScanJobOptions opts;
    opts.hash_threads = 2;
    auto groups = ScanJob::find_duplicates(files, opts, cancel);
    REQUIRE(groups.size() == 1);
    REQUIRE(groups[0].files.size() == 2);
    REQUIRE(groups[0].file_size == 17);
}
