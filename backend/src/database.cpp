#include "database.h"

#include <nlohmann/json.hpp>
#include <sqlite3.h>

#include <algorithm>
#include <unordered_map>
#include <unordered_set>

namespace
{
    constexpr int SCHEMA_VERSION = 2;

    // ---- Thin, checked wrappers around the SQLite C API --------------------

    [[noreturn]] void throw_db(sqlite3 *db, const std::string &what)
    {
        throw DbError(what + ": " + sqlite3_errmsg(db));
    }

    class Stmt
    {
      public:
        Stmt(sqlite3 *db, const std::string &sql) : m_db(db)
        {
            if (sqlite3_prepare_v2(db, sql.c_str(), -1, &m_stmt, nullptr) != SQLITE_OK)
                throw_db(db, "prepare failed for [" + sql + "]");
        }
        ~Stmt() { sqlite3_finalize(m_stmt); }
        Stmt(const Stmt &) = delete;
        Stmt &operator=(const Stmt &) = delete;

        Stmt &bind(int i, int64_t v)
        {
            check(sqlite3_bind_int64(m_stmt, i, v));
            return *this;
        }
        Stmt &bind(int i, uint64_t v) { return bind(i, static_cast<int64_t>(v)); }
        Stmt &bind(int i, int v) { return bind(i, static_cast<int64_t>(v)); }
        Stmt &bind(int i, double v)
        {
            check(sqlite3_bind_double(m_stmt, i, v));
            return *this;
        }
        Stmt &bind(int i, const std::string &v)
        {
            check(sqlite3_bind_text(m_stmt, i, v.c_str(), static_cast<int>(v.size()), SQLITE_TRANSIENT));
            return *this;
        }

        // Returns true while a row is available.
        bool step()
        {
            const int rc = sqlite3_step(m_stmt);
            if (rc == SQLITE_ROW)
                return true;
            if (rc == SQLITE_DONE)
                return false;
            throw_db(m_db, "step failed");
        }

        // Runs a statement that returns no rows, then resets it for reuse.
        void run()
        {
            while (step())
            {
            }
            reset();
        }

        void reset()
        {
            sqlite3_reset(m_stmt);
            sqlite3_clear_bindings(m_stmt);
        }

        int64_t i64(int col) const { return sqlite3_column_int64(m_stmt, col); }
        uint64_t u64(int col) const
        {
            const int64_t v = i64(col);
            return v < 0 ? 0 : static_cast<uint64_t>(v);
        }
        double dbl(int col) const { return sqlite3_column_double(m_stmt, col); }
        std::string text(int col) const
        {
            const auto *p = reinterpret_cast<const char *>(sqlite3_column_text(m_stmt, col));
            return p ? std::string(p, static_cast<size_t>(sqlite3_column_bytes(m_stmt, col))) : std::string();
        }

      private:
        void check(int rc)
        {
            if (rc != SQLITE_OK)
                throw_db(m_db, "bind failed");
        }

        sqlite3 *m_db;
        sqlite3_stmt *m_stmt = nullptr;
    };

    void exec(sqlite3 *db, const std::string &sql)
    {
        char *err = nullptr;
        if (sqlite3_exec(db, sql.c_str(), nullptr, nullptr, &err) != SQLITE_OK)
        {
            std::string msg = err ? err : "unknown error";
            sqlite3_free(err);
            throw DbError("SQLite error: " + msg);
        }
    }

    // Rolls back unless commit() was called, so an exception inside a
    // transaction never leaves the connection stuck in it.
    class Transaction
    {
      public:
        explicit Transaction(sqlite3 *db) : m_db(db) { exec(db, "BEGIN IMMEDIATE"); }
        ~Transaction()
        {
            if (!m_done)
                sqlite3_exec(m_db, "ROLLBACK", nullptr, nullptr, nullptr);
        }
        void commit()
        {
            exec(m_db, "COMMIT");
            m_done = true;
        }

      private:
        sqlite3 *m_db;
        bool m_done = false;
    };

    const char *const FILE_COLUMNS =
        "f.id, f.parent_id, f.name, f.extension, f.size, f.disk_size, f.modified_time, f.is_directory, f.hash";

    FileEntry read_file(const Stmt &s, int c = 0)
    {
        FileEntry f;
        f.id = s.i64(c + 0);
        f.parent_id = s.i64(c + 1);
        f.name = s.text(c + 2);
        f.extension = s.text(c + 3);
        f.size = s.u64(c + 4);
        f.disk_size = s.u64(c + 5);
        f.modified_time = s.i64(c + 6);
        f.is_directory = s.i64(c + 7) != 0;
        f.hash = s.text(c + 8);
        return f;
    }

    const char *const SCAN_COLUMNS =
        "id, root_path, total_files, total_directories, total_size, duplicate_groups, duplicate_files, "
        "wasted_space, scan_date, scan_duration, status, exclusions, min_size";

    ScanResult read_scan(const Stmt &s)
    {
        ScanResult r;
        r.scan_id = s.i64(0);
        r.root_path = s.text(1);
        r.total_files = s.u64(2);
        r.total_directories = s.u64(3);
        r.total_size = s.u64(4);
        r.duplicate_groups = s.u64(5);
        r.duplicate_files = s.u64(6);
        r.wasted_space = s.u64(7);
        r.scan_date = s.text(8);
        r.scan_duration = s.dbl(9);
        r.status = s.text(10);
        try
        {
            auto j = nlohmann::json::parse(s.text(11));
            if (j.is_array())
                r.exclusions = j.get<std::vector<std::string>>();
        }
        catch (const std::exception &)
        {
        }
        r.min_size = s.u64(12);
        return r;
    }

    std::string join_path(const std::string &dir, const std::string &name)
    {
        if (!dir.empty() && dir.back() == '/')
            return dir + name;
        return dir + "/" + name;
    }

    std::string like_pattern(const std::string &needle)
    {
        std::string out = "%";
        for (char c : needle)
        {
            if (c == '%' || c == '_' || c == '\\')
                out += '\\';
            out += c;
        }
        return out + "%";
    }

    std::string fts_phrase(const std::string &needle)
    {
        std::string out = "\"";
        for (char c : needle)
        {
            if (c == '"')
                out += '"';
            out += c;
        }
        return out + "\"";
    }

    const char *dir_sql(SortOrder o)
    {
        return o == SortOrder::Asc ? "ASC" : "DESC";
    }
} // namespace

struct Database::Impl
{
    sqlite3 *db = nullptr;
    bool fts = false;

    // Rebuilds full paths from the parent chain. `cache` maps directory ids to
    // their paths so repeated lookups are cheap.
    std::string path_of(int64_t scan_id, int64_t id, std::unordered_map<int64_t, std::string> &cache)
    {
        if (auto it = cache.find(id); it != cache.end())
            return it->second;

        Stmt s(db, "SELECT parent_id, name FROM files WHERE scan_id = ? AND id = ?");
        std::vector<std::pair<int64_t, std::string>> chain;
        int64_t current = id;
        std::string base;
        while (current >= 0)
        {
            if (auto it = cache.find(current); it != cache.end())
            {
                base = it->second;
                break;
            }
            s.bind(1, scan_id).bind(2, current);
            if (!s.step())
            {
                s.reset();
                break;
            }
            const int64_t parent = s.i64(0);
            chain.emplace_back(current, s.text(1));
            s.reset();
            current = parent;
        }

        // chain is child -> root; the root's name is the full root path.
        std::string path = base;
        for (auto it = chain.rbegin(); it != chain.rend(); ++it)
        {
            path = path.empty() ? it->second : join_path(path, it->second);
            cache[it->first] = path;
        }
        return path;
    }

    void fill_paths(int64_t scan_id, std::vector<FileEntry> &files)
    {
        std::unordered_map<int64_t, std::string> cache;
        for (auto &f : files)
            f.path = path_of(scan_id, f.id, cache);
    }
};

Database::Database(const std::string &db_path) : m_impl(std::make_unique<Impl>())
{
    if (sqlite3_open(db_path.c_str(), &m_impl->db) != SQLITE_OK)
    {
        std::string msg = m_impl->db ? sqlite3_errmsg(m_impl->db) : "out of memory";
        sqlite3_close(m_impl->db);
        throw DbError("Failed to open database " + db_path + ": " + msg);
    }
    sqlite3 *db = m_impl->db;
    sqlite3_busy_timeout(db, 5000);
    exec(db, "PRAGMA journal_mode=WAL");
    exec(db, "PRAGMA synchronous=NORMAL");
    exec(db, "PRAGMA cache_size=-65536"); // 64 MiB
    exec(db, "PRAGMA foreign_keys=OFF");

    int version = 0;
    {
        Stmt s(db, "PRAGMA user_version");
        if (s.step())
            version = static_cast<int>(s.i64(0));
    }
    if (version != 0 && version != SCHEMA_VERSION)
    {
        // Older layouts stored full paths and a single size column; their
        // data can't be converted, so start over.
        exec(db, "DROP TABLE IF EXISTS duplicate_files; DROP TABLE IF EXISTS duplicate_groups;"
                 "DROP TABLE IF EXISTS files_fts; DROP TABLE IF EXISTS files; DROP TABLE IF EXISTS scans;");
    }

    exec(db, R"(
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_path TEXT NOT NULL,
            total_files INTEGER NOT NULL DEFAULT 0,
            total_directories INTEGER NOT NULL DEFAULT 0,
            total_size INTEGER NOT NULL DEFAULT 0,
            duplicate_groups INTEGER NOT NULL DEFAULT 0,
            duplicate_files INTEGER NOT NULL DEFAULT 0,
            wasted_space INTEGER NOT NULL DEFAULT 0,
            scan_date TEXT NOT NULL DEFAULT (datetime('now')),
            scan_duration REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'running',
            exclusions TEXT NOT NULL DEFAULT '[]',
            min_size INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS files (
            uid INTEGER PRIMARY KEY,
            scan_id INTEGER NOT NULL,
            id INTEGER NOT NULL,
            parent_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            extension TEXT NOT NULL DEFAULT '',
            size INTEGER NOT NULL DEFAULT 0,
            disk_size INTEGER NOT NULL DEFAULT 0,
            modified_time INTEGER NOT NULL DEFAULT 0,
            is_directory INTEGER NOT NULL DEFAULT 0,
            hash TEXT NOT NULL DEFAULT '',
            UNIQUE (scan_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_files_scan_parent ON files(scan_id, parent_id);
        CREATE TABLE IF NOT EXISTS duplicate_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id INTEGER NOT NULL,
            hash TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            file_count INTEGER NOT NULL DEFAULT 0,
            wasted_space INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_dup_groups_scan ON duplicate_groups(scan_id, wasted_space);
        CREATE TABLE IF NOT EXISTS duplicate_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            scan_id INTEGER NOT NULL,
            file_id INTEGER NOT NULL,
            path TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_dup_files_group ON duplicate_files(group_id);
        CREATE INDEX IF NOT EXISTS idx_dup_files_file ON duplicate_files(scan_id, file_id);
    )");

    // Trigram full-text index for substring search. Optional: falls back to
    // LIKE when this SQLite lacks FTS5 or the trigram tokenizer.
    // contentless_delete needs SQLite 3.43+. The table may also exist already,
    // made by a newer SQLite than this one (the same database opened by
    // another build), so check that it can actually be used, not just created.
    exec(db, "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    try
    {
        exec(db, "CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5("
                 "name, content='', contentless_delete=1, tokenize='trigram')");
        Stmt probe(db, "SELECT rowid FROM files_fts WHERE files_fts MATCH 'abc' LIMIT 0");
        probe.step();
        m_impl->fts = true;
    }
    catch (const DbError &)
    {
        m_impl->fts = false;
    }

    if (!m_impl->fts)
    {
        // Files added or removed now won't reach the index, so a later run
        // with a capable SQLite must rebuild it before trusting it.
        exec(db, "INSERT OR REPLACE INTO meta (key, value) VALUES ('fts_stale', '1')");
    }
    else
    {
        bool stale = false;
        {
            Stmt s(db, "SELECT value FROM meta WHERE key = 'fts_stale'");
            stale = s.step();
        }
        if (stale)
        {
            Transaction tx(db);
            exec(db, "INSERT INTO files_fts (files_fts) VALUES ('delete-all');"
                     "INSERT INTO files_fts (rowid, name) SELECT uid, name FROM files WHERE id != 0;"
                     "DELETE FROM meta WHERE key = 'fts_stale';");
            tx.commit();
        }
    }

    exec(db, "PRAGMA user_version = " + std::to_string(SCHEMA_VERSION));
}

Database::~Database()
{
    sqlite3_close(m_impl->db);
}

bool Database::has_fts() const
{
    return m_impl->fts;
}

// ---- Scans ------------------------------------------------------------------

int64_t Database::create_scan(const std::string &root_path, const std::vector<std::string> &exclusions,
                              uint64_t min_size)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    Stmt s(m_impl->db, "INSERT INTO scans (root_path, status, exclusions, min_size) VALUES (?, 'running', ?, ?)");
    s.bind(1, root_path).bind(2, nlohmann::json(exclusions).dump()).bind(3, min_size);
    s.run();
    return sqlite3_last_insert_rowid(m_impl->db);
}

void Database::complete_scan(const ScanResult &r)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    Stmt s(m_impl->db, R"(
        UPDATE scans SET total_files = ?, total_directories = ?, total_size = ?,
            duplicate_groups = ?, duplicate_files = ?, wasted_space = ?,
            scan_duration = ?, status = 'completed'
        WHERE id = ?)");
    s.bind(1, r.total_files).bind(2, r.total_directories).bind(3, r.total_size);
    s.bind(4, r.duplicate_groups).bind(5, r.duplicate_files).bind(6, r.wasted_space);
    s.bind(7, r.scan_duration).bind(8, r.scan_id);
    s.run();
}

void Database::set_scan_status(int64_t scan_id, const std::string &status)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    Stmt s(m_impl->db, "UPDATE scans SET status = ? WHERE id = ?");
    s.bind(1, status).bind(2, scan_id);
    s.run();
}

void Database::mark_interrupted_scans()
{
    std::lock_guard<std::mutex> lock(m_mutex);
    exec(m_impl->db, "UPDATE scans SET status = 'failed' WHERE status = 'running'");
}

std::optional<ScanResult> Database::get_scan(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    Stmt s(m_impl->db, std::string("SELECT ") + SCAN_COLUMNS + " FROM scans WHERE id = ?");
    s.bind(1, scan_id);
    if (!s.step())
        return std::nullopt;
    return read_scan(s);
}

std::vector<ScanResult> Database::get_all_scans()
{
    std::lock_guard<std::mutex> lock(m_mutex);
    Stmt s(m_impl->db, std::string("SELECT ") + SCAN_COLUMNS + " FROM scans ORDER BY id DESC");
    std::vector<ScanResult> out;
    while (s.step())
        out.push_back(read_scan(s));
    return out;
}

void Database::delete_scan(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    sqlite3 *db = m_impl->db;
    Transaction tx(db);
    if (m_impl->fts)
    {
        Stmt fts(db, "DELETE FROM files_fts WHERE rowid IN (SELECT uid FROM files WHERE scan_id = ?)");
        fts.bind(1, scan_id).run();
    }
    for (const char *sql :
         {"DELETE FROM duplicate_files WHERE scan_id = ?", "DELETE FROM duplicate_groups WHERE scan_id = ?",
          "DELETE FROM files WHERE scan_id = ?", "DELETE FROM scans WHERE id = ?"})
    {
        Stmt s(db, sql);
        s.bind(1, scan_id).run();
    }
    tx.commit();
}

// ---- Files ------------------------------------------------------------------

void Database::insert_files(int64_t scan_id, const std::vector<FileEntry> &files)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    sqlite3 *db = m_impl->db;
    Transaction tx(db);
    Stmt s(db, R"(
        INSERT INTO files (scan_id, id, parent_id, name, extension, size, disk_size, modified_time, is_directory, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?))");
    for (const auto &f : files)
    {
        s.bind(1, scan_id).bind(2, f.id).bind(3, f.parent_id).bind(4, f.name).bind(5, f.extension);
        s.bind(6, f.size).bind(7, f.disk_size).bind(8, f.modified_time);
        s.bind(9, f.is_directory ? 1 : 0).bind(10, f.hash);
        s.run();
    }
    if (m_impl->fts)
    {
        Stmt fts(db, "INSERT INTO files_fts (rowid, name) SELECT uid, name FROM files WHERE scan_id = ? AND id != 0");
        fts.bind(1, scan_id).run();
    }
    tx.commit();
}

Page<FileEntry> Database::get_files(int64_t scan_id, const FileQuery &q)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    sqlite3 *db = m_impl->db;

    Page<FileEntry> page;
    {
        Stmt c(db, "SELECT COUNT(*) FROM files WHERE scan_id = ? AND parent_id = ?");
        c.bind(1, scan_id).bind(2, q.parent_id);
        if (c.step())
            page.total = c.u64(0);
    }

    const char *dir = dir_sql(q.order);
    std::string order;
    if (q.sort == "size")
        order = std::string("f.disk_size ") + dir + ", f.name COLLATE NOCASE";
    else if (q.sort == "extension")
        order = std::string("f.is_directory DESC, f.extension COLLATE NOCASE ") + dir + ", f.name COLLATE NOCASE";
    else if (q.sort == "modified")
        order = std::string("f.modified_time ") + dir + ", f.name COLLATE NOCASE";
    else
        order = std::string("f.is_directory DESC, f.name COLLATE NOCASE ") + dir;

    Stmt s(db, std::string("SELECT ") + FILE_COLUMNS +
                   " FROM files f WHERE f.scan_id = ? AND f.parent_id = ? ORDER BY " + order + " LIMIT ? OFFSET ?");
    s.bind(1, scan_id).bind(2, q.parent_id).bind(3, q.limit).bind(4, q.offset);
    while (s.step())
        page.items.push_back(read_file(s));

    std::unordered_map<int64_t, std::string> cache;
    const std::string parent_path = m_impl->path_of(scan_id, q.parent_id, cache);
    for (auto &f : page.items)
        f.path = join_path(parent_path, f.name);
    return page;
}

std::optional<FileEntry> Database::get_file(int64_t scan_id, int64_t file_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    Stmt s(m_impl->db, std::string("SELECT ") + FILE_COLUMNS + " FROM files f WHERE f.scan_id = ? AND f.id = ?");
    s.bind(1, scan_id).bind(2, file_id);
    if (!s.step())
        return std::nullopt;
    std::vector<FileEntry> one{read_file(s)};
    m_impl->fill_paths(scan_id, one);
    return one.front();
}

std::vector<FileEntry> Database::get_ancestors(int64_t scan_id, int64_t file_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    Stmt s(m_impl->db, std::string("SELECT ") + FILE_COLUMNS + " FROM files f WHERE f.scan_id = ? AND f.id = ?");
    std::vector<FileEntry> chain;
    int64_t current = file_id;
    while (current >= 0 && chain.size() < 4096)
    {
        s.bind(1, scan_id).bind(2, current);
        if (!s.step())
            break;
        chain.push_back(read_file(s));
        s.reset();
        current = chain.back().parent_id;
    }
    std::reverse(chain.begin(), chain.end()); // root first
    m_impl->fill_paths(scan_id, chain);
    return chain;
}

std::vector<FileEntry> Database::search_files(int64_t scan_id, const std::string &query, int limit)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    sqlite3 *db = m_impl->db;
    std::vector<FileEntry> out;

    if (m_impl->fts && query.size() >= 3)
    {
        Stmt s(db, std::string("SELECT ") + FILE_COLUMNS +
                       " FROM files_fts JOIN files f ON f.uid = files_fts.rowid"
                       " WHERE files_fts MATCH ? AND f.scan_id = ?"
                       " ORDER BY f.is_directory DESC, f.name COLLATE NOCASE LIMIT ?");
        s.bind(1, "name : " + fts_phrase(query)).bind(2, scan_id).bind(3, limit);
        while (s.step())
            out.push_back(read_file(s));
    }
    else
    {
        Stmt s(db, std::string("SELECT ") + FILE_COLUMNS +
                       " FROM files f WHERE f.scan_id = ? AND f.id != 0 AND f.name LIKE ? ESCAPE '\\'"
                       " ORDER BY f.is_directory DESC, f.name COLLATE NOCASE LIMIT ?");
        s.bind(1, scan_id).bind(2, like_pattern(query)).bind(3, limit);
        while (s.step())
            out.push_back(read_file(s));
    }
    m_impl->fill_paths(scan_id, out);
    return out;
}

size_t Database::remove_files(int64_t scan_id, const std::vector<int64_t> &file_ids)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    sqlite3 *db = m_impl->db;
    Transaction tx(db);

    Stmt sel(db, "SELECT uid, parent_id, disk_size FROM files WHERE scan_id = ? AND id = ? AND is_directory = 0");
    Stmt shrink(db, R"(
        WITH RECURSIVE anc(id) AS (
            SELECT ?3
            UNION ALL
            SELECT f.parent_id FROM files f JOIN anc ON f.scan_id = ?1 AND f.id = anc.id WHERE f.parent_id >= 0
        )
        UPDATE files SET disk_size = MAX(disk_size - ?2, 0)
        WHERE scan_id = ?1 AND id IN (SELECT id FROM anc))");
    Stmt groups_of(db, "SELECT group_id FROM duplicate_files WHERE scan_id = ? AND file_id = ?");
    Stmt del_dup(db, "DELETE FROM duplicate_files WHERE scan_id = ? AND file_id = ?");
    Stmt del_file(db, "DELETE FROM files WHERE uid = ?");
    std::unique_ptr<Stmt> del_fts;
    if (m_impl->fts)
        del_fts = std::make_unique<Stmt>(db, "DELETE FROM files_fts WHERE rowid = ?");

    std::unordered_set<int64_t> touched_groups;
    size_t removed = 0;
    for (int64_t id : file_ids)
    {
        sel.bind(1, scan_id).bind(2, id);
        if (!sel.step())
        {
            sel.reset();
            continue;
        }
        const int64_t uid = sel.i64(0);
        const int64_t parent = sel.i64(1);
        const int64_t disk = sel.i64(2);
        sel.reset();

        shrink.bind(1, scan_id).bind(2, disk).bind(3, parent);
        shrink.run();

        groups_of.bind(1, scan_id).bind(2, id);
        while (groups_of.step())
            touched_groups.insert(groups_of.i64(0));
        groups_of.reset();

        del_dup.bind(1, scan_id).bind(2, id);
        del_dup.run();
        if (del_fts)
        {
            del_fts->bind(1, uid);
            del_fts->run();
        }
        del_file.bind(1, uid);
        del_file.run();
        ++removed;
    }

    // Refresh the duplicate groups that lost members; drop the ones that no
    // longer have two copies.
    Stmt recount(db, R"(
        UPDATE duplicate_groups SET
            file_count = (SELECT COUNT(*) FROM duplicate_files df WHERE df.group_id = duplicate_groups.id),
            wasted_space = (SELECT COALESCE(SUM(f.disk_size) - MAX(f.disk_size), 0)
                            FROM duplicate_files df JOIN files f ON f.scan_id = df.scan_id AND f.id = df.file_id
                            WHERE df.group_id = duplicate_groups.id)
        WHERE id = ?)");
    Stmt drop_members(db, "DELETE FROM duplicate_files WHERE group_id = ? AND "
                          "(SELECT file_count FROM duplicate_groups WHERE id = ?) < 2");
    Stmt drop_group(db, "DELETE FROM duplicate_groups WHERE id = ? AND file_count < 2");
    for (int64_t gid : touched_groups)
    {
        recount.bind(1, gid);
        recount.run();
        drop_members.bind(1, gid).bind(2, gid);
        drop_members.run();
        drop_group.bind(1, gid);
        drop_group.run();
    }

    Stmt totals(db, R"(
        UPDATE scans SET
            total_files = MAX(total_files - ?2, 0),
            total_size = COALESCE((SELECT disk_size FROM files WHERE scan_id = ?1 AND id = 0), 0),
            duplicate_groups = (SELECT COUNT(*) FROM duplicate_groups WHERE scan_id = ?1),
            duplicate_files = (SELECT COALESCE(SUM(file_count), 0) FROM duplicate_groups WHERE scan_id = ?1),
            wasted_space = (SELECT COALESCE(SUM(wasted_space), 0) FROM duplicate_groups WHERE scan_id = ?1)
        WHERE id = ?1)");
    totals.bind(1, scan_id).bind(2, static_cast<int64_t>(removed));
    totals.run();

    tx.commit();
    return removed;
}

// ---- Duplicates ---------------------------------------------------------------

void Database::store_duplicates(int64_t scan_id, const std::vector<DuplicateGroup> &groups)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    sqlite3 *db = m_impl->db;
    Transaction tx(db);
    Stmt g(db,
           "INSERT INTO duplicate_groups (scan_id, hash, file_size, file_count, wasted_space) VALUES (?, ?, ?, ?, ?)");
    Stmt f(db, "INSERT INTO duplicate_files (group_id, scan_id, file_id, path) VALUES (?, ?, ?, ?)");
    Stmt h(db, "UPDATE files SET hash = ? WHERE scan_id = ? AND id = ?");
    for (const auto &group : groups)
    {
        g.bind(1, scan_id).bind(2, group.hash).bind(3, group.file_size);
        g.bind(4, static_cast<int64_t>(group.files.size())).bind(5, group.wasted_space);
        g.run();
        const int64_t group_id = sqlite3_last_insert_rowid(db);
        for (const auto &file : group.files)
        {
            f.bind(1, group_id).bind(2, scan_id).bind(3, file.id).bind(4, file.path);
            f.run();
            h.bind(1, group.hash).bind(2, scan_id).bind(3, file.id);
            h.run();
        }
    }
    tx.commit();
}

Page<DuplicateGroup> Database::get_duplicates(int64_t scan_id, const DuplicateQuery &q)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    sqlite3 *db = m_impl->db;

    std::string where = "g.scan_id = ?1";
    if (!q.filter.empty())
        where += " AND EXISTS (SELECT 1 FROM duplicate_files m WHERE m.group_id = g.id"
                 " AND m.path LIKE ?2 ESCAPE '\\')";

    const char *dir = dir_sql(q.order);
    std::string order;
    if (q.sort == "size")
        order = std::string("g.file_size ") + dir;
    else if (q.sort == "count")
        order = std::string("g.file_count ") + dir;
    else if (q.sort == "name")
        order = std::string("(SELECT MIN(f.name) FROM duplicate_files m JOIN files f ON f.scan_id = m.scan_id "
                            "AND f.id = m.file_id WHERE m.group_id = g.id) COLLATE NOCASE ") +
                dir;
    else if (q.sort == "path")
        order = std::string("(SELECT MIN(m.path) FROM duplicate_files m WHERE m.group_id = g.id) ") + dir;
    else
        order = std::string("g.wasted_space ") + dir;
    order += ", g.id";

    Page<DuplicateGroup> page;
    {
        Stmt c(db, "SELECT COUNT(*) FROM duplicate_groups g WHERE " + where);
        c.bind(1, scan_id);
        if (!q.filter.empty())
            c.bind(2, like_pattern(q.filter));
        if (c.step())
            page.total = c.u64(0);
    }

    Stmt s(db, "SELECT g.id, g.hash, g.file_size, g.wasted_space FROM duplicate_groups g WHERE " + where +
                   " ORDER BY " + order + " LIMIT ?3 OFFSET ?4");
    s.bind(1, scan_id);
    if (!q.filter.empty())
        s.bind(2, like_pattern(q.filter));
    s.bind(3, q.limit).bind(4, q.offset);

    std::unordered_map<int64_t, size_t> index;
    while (s.step())
    {
        DuplicateGroup grp;
        grp.id = s.i64(0);
        grp.hash = s.text(1);
        grp.file_size = s.u64(2);
        grp.wasted_space = s.u64(3);
        index[grp.id] = page.items.size();
        page.items.push_back(std::move(grp));
    }
    if (page.items.empty())
        return page;

    // One query for all members of the groups on this page.
    std::string placeholders;
    for (size_t i = 0; i < page.items.size(); ++i)
        placeholders += i ? ",?" : "?";
    Stmt m(db, std::string("SELECT df.group_id, df.path, ") + FILE_COLUMNS +
                   " FROM duplicate_files df JOIN files f ON f.scan_id = df.scan_id AND f.id = df.file_id"
                   " WHERE df.group_id IN (" +
                   placeholders + ") ORDER BY df.group_id, df.path");
    for (size_t i = 0; i < page.items.size(); ++i)
        m.bind(static_cast<int>(i + 1), page.items[i].id);
    while (m.step())
    {
        FileEntry f = read_file(m, 2);
        f.path = m.text(1);
        page.items[index[m.i64(0)]].files.push_back(std::move(f));
    }
    return page;
}

std::optional<DuplicateGroup> Database::get_duplicate_group(int64_t scan_id, int64_t group_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    sqlite3 *db = m_impl->db;
    Stmt s(db, "SELECT id, hash, file_size, wasted_space FROM duplicate_groups WHERE scan_id = ? AND id = ?");
    s.bind(1, scan_id).bind(2, group_id);
    if (!s.step())
        return std::nullopt;
    DuplicateGroup g;
    g.id = s.i64(0);
    g.hash = s.text(1);
    g.file_size = s.u64(2);
    g.wasted_space = s.u64(3);

    Stmt m(db, std::string("SELECT df.path, ") + FILE_COLUMNS +
                   " FROM duplicate_files df JOIN files f ON f.scan_id = df.scan_id AND f.id = df.file_id"
                   " WHERE df.group_id = ? ORDER BY df.path");
    m.bind(1, group_id);
    while (m.step())
    {
        FileEntry f = read_file(m, 1);
        f.path = m.text(0);
        g.files.push_back(std::move(f));
    }
    return g;
}

// ---- Statistics -----------------------------------------------------------------

std::vector<FileTypeStats> Database::get_file_type_stats(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    Stmt s(m_impl->db, "SELECT extension, COUNT(*), SUM(disk_size) FROM files WHERE scan_id = ? AND is_directory = 0 "
                       "GROUP BY lower(extension) ORDER BY SUM(disk_size) DESC LIMIT 20");
    s.bind(1, scan_id);
    std::vector<FileTypeStats> out;
    while (s.step())
    {
        FileTypeStats st;
        st.extension = s.text(0);
        if (st.extension.empty())
            st.extension = "(no extension)";
        st.count = s.u64(1);
        st.total_size = s.u64(2);
        out.push_back(st);
    }
    return out;
}
