#include <catch2/catch_test_macros.hpp>

#include "database.h"
#include "test_helpers.h"

namespace
{
    FileEntry entry(int64_t id, int64_t parent, const std::string &name, bool dir, uint64_t disk)
    {
        FileEntry f;
        f.id = id;
        f.parent_id = parent;
        f.name = name;
        f.is_directory = dir;
        f.size = disk;
        f.disk_size = disk;
        return f;
    }

    // /root
    //   docs/ (a.txt 100, b.txt 100)
    //   c_100%.txt 50
    std::vector<FileEntry> sample()
    {
        return {
            entry(0, -1, "/root", true, 250), entry(1, 0, "docs", true, 200),       entry(2, 1, "a.txt", false, 100),
            entry(3, 1, "b.txt", false, 100), entry(4, 0, "c_100%.txt", false, 50),
        };
    }
} // namespace

TEST_CASE("files: paging, sorting and path reconstruction")
{
    TempDir dir;
    Database db((dir.path / "t.db").string());
    const auto scan = db.create_scan("/root", {"*.o"}, 0);
    db.insert_files(scan, sample());

    FileQuery q;
    q.parent_id = 0;
    auto page = db.get_files(scan, q);
    REQUIRE(page.total == 2);
    REQUIRE(page.items[0].name == "docs"); // directories first
    REQUIRE(page.items[1].path == "/root/c_100%.txt");

    q.parent_id = 1;
    q.sort = "size";
    q.order = SortOrder::Desc;
    q.limit = 1;
    q.offset = 1;
    page = db.get_files(scan, q);
    REQUIRE(page.total == 2);
    REQUIRE(page.items.size() == 1);
    REQUIRE(page.items[0].path.rfind("/root/docs/", 0) == 0);

    auto chain = db.get_ancestors(scan, 2);
    REQUIRE(chain.size() == 3);
    REQUIRE(chain.front().id == 0);
    REQUIRE(chain.back().path == "/root/docs/a.txt");

    REQUIRE(db.get_scan(scan)->exclusions == std::vector<std::string>{"*.o"});
}

TEST_CASE("search escapes LIKE wildcards")
{
    TempDir dir;
    Database db((dir.path / "t.db").string());
    const auto scan = db.create_scan("/root", {}, 0);
    db.insert_files(scan, sample());

    REQUIRE(db.search_files(scan, "%").size() == 1); // only c_100%.txt
    REQUIRE(db.search_files(scan, "_").size() == 1);
    REQUIRE(db.search_files(scan, "a.t").size() == 1); // trigram / LIKE path
    REQUIRE(db.search_files(scan, ".txt").size() == 3);
    REQUIRE(db.search_files(scan, "root").empty()); // the root itself isn't a result
}

TEST_CASE("removing files updates folder sizes, totals and duplicate groups")
{
    TempDir dir;
    Database db((dir.path / "t.db").string());
    const auto scan = db.create_scan("/root", {}, 0);
    auto files = sample();
    db.insert_files(scan, files);

    DuplicateGroup g;
    g.hash = "h";
    g.file_size = 100;
    g.wasted_space = 100;
    files[2].path = "/root/docs/a.txt";
    files[3].path = "/root/docs/b.txt";
    g.files = {files[2], files[3]};
    db.store_duplicates(scan, {g});

    ScanResult r;
    r.scan_id = scan;
    r.total_files = 3;
    r.total_size = 250;
    r.duplicate_groups = 1;
    r.duplicate_files = 2;
    r.wasted_space = 100;
    db.complete_scan(r);

    auto page = db.get_duplicates(scan, DuplicateQuery{});
    REQUIRE(page.total == 1);
    REQUIRE(page.items[0].files.size() == 2);

    DuplicateQuery filtered;
    filtered.filter = "nomatch";
    REQUIRE(db.get_duplicates(scan, filtered).total == 0);

    REQUIRE(db.remove_files(scan, {3}) == 1);
    REQUIRE(db.get_file(scan, 1)->disk_size == 100);
    REQUIRE(db.get_file(scan, 0)->disk_size == 150);
    auto s = db.get_scan(scan);
    REQUIRE(s->total_files == 2);
    REQUIRE(s->total_size == 150);
    REQUIRE(s->duplicate_groups == 0); // a group of one isn't a duplicate
    REQUIRE(s->wasted_space == 0);
    REQUIRE(db.get_duplicates(scan, DuplicateQuery{}).total == 0);
}

TEST_CASE("deleting a scan removes everything")
{
    TempDir dir;
    Database db((dir.path / "t.db").string());
    const auto scan = db.create_scan("/root", {}, 0);
    db.insert_files(scan, sample());
    db.delete_scan(scan);
    REQUIRE_FALSE(db.get_scan(scan));
    REQUIRE(db.search_files(scan, "txt").empty());
}
