#include "database.h"
#include <sqlite3.h>
#include <stdexcept>
#include <ctime>
#include <sstream>
#include <iostream>
#include <mutex>

struct Database::Impl
{
    sqlite3 *db = nullptr;
    std::string db_path;

    void exec(const std::string &sql)
    {
        char *err = nullptr;
        int rc = sqlite3_exec(db, sql.c_str(), nullptr, nullptr, &err);
        if (rc != SQLITE_OK)
        {
            std::string msg = err ? err : "Unknown error";
            sqlite3_free(err);
            throw std::runtime_error("SQLite error: " + msg);
        }
    }
};

Database::Database(const std::string &db_path) : m_impl(std::make_unique<Impl>())
{
    m_impl->db_path = db_path;
    int rc = sqlite3_open(db_path.c_str(), &m_impl->db);
    if (rc != SQLITE_OK)
    {
        throw std::runtime_error("Failed to open database: " + std::string(sqlite3_errmsg(m_impl->db)));
    }
    // Enable WAL mode for better concurrent performance
    m_impl->exec("PRAGMA journal_mode=WAL");
    m_impl->exec("PRAGMA synchronous=NORMAL");
    m_impl->exec("PRAGMA cache_size=10000");
    initialize();
}

Database::~Database()
{
    if (m_impl->db)
    {
        sqlite3_close(m_impl->db);
    }
}

void Database::initialize()
{
    std::lock_guard<std::mutex> lock(m_mutex);

    m_impl->exec(R"(
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_path TEXT NOT NULL,
            total_files INTEGER DEFAULT 0,
            total_directories INTEGER DEFAULT 0,
            total_size INTEGER DEFAULT 0,
            duplicate_groups INTEGER DEFAULT 0,
            duplicate_files INTEGER DEFAULT 0,
            wasted_space INTEGER DEFAULT 0,
            scan_date TEXT DEFAULT (datetime('now')),
            scan_duration REAL DEFAULT 0,
            status TEXT DEFAULT 'running'
        );
    )");

    m_impl->exec(R"(
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER NOT NULL,
            scan_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            name TEXT NOT NULL,
            extension TEXT DEFAULT '',
            size INTEGER DEFAULT 0,
            modified_time INTEGER DEFAULT 0,
            is_directory INTEGER DEFAULT 0,
            hash TEXT DEFAULT '',
            parent_id INTEGER DEFAULT -1,
            PRIMARY KEY (scan_id, id),
            FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
        );
    )");

    m_impl->exec(R"(
        CREATE TABLE IF NOT EXISTS duplicate_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id INTEGER NOT NULL,
            hash TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            file_count INTEGER DEFAULT 0,
            wasted_space INTEGER DEFAULT 0,
            FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
        );
    )");

    m_impl->exec(R"(
        CREATE TABLE IF NOT EXISTS duplicate_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            scan_id INTEGER NOT NULL,
            file_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            FOREIGN KEY (group_id) REFERENCES duplicate_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (scan_id, file_id) REFERENCES files(scan_id, id) ON DELETE CASCADE
        );
    )");

    auto table_has_column = [this](const std::string &table, const std::string &column)
    {
        sqlite3_stmt *stmt = nullptr;
        std::string sql = "PRAGMA table_info(" + table + ");";
        if (sqlite3_prepare_v2(m_impl->db, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK)
            return false;
        bool found = false;
        while (sqlite3_step(stmt) == SQLITE_ROW)
        {
            const char *name = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
            if (name && column == name)
            {
                found = true;
                break;
            }
        }
        sqlite3_finalize(stmt);
        return found;
    };

    auto files_has_composite_pk = [this]()
    {
        sqlite3_stmt *stmt = nullptr;
        if (sqlite3_prepare_v2(m_impl->db, "PRAGMA table_info(files);", -1, &stmt, nullptr) != SQLITE_OK)
            return false;
        int pk_id = 0;
        int pk_scan = 0;
        while (sqlite3_step(stmt) == SQLITE_ROW)
        {
            const char *name = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
            int pk = sqlite3_column_int(stmt, 5);
            if (name)
            {
                if (std::string(name) == "id")
                    pk_id = pk;
                else if (std::string(name) == "scan_id")
                    pk_scan = pk;
            }
        }
        sqlite3_finalize(stmt);
        return pk_id > 0 && pk_scan > 0;
    };

    if (!table_has_column("scans", "status"))
    {
        m_impl->exec("ALTER TABLE scans ADD COLUMN status TEXT DEFAULT 'completed';");
    }

    // Migration: allow per-scan file IDs and link duplicates with scan_id.
    if (!files_has_composite_pk())
    {
        m_impl->exec("BEGIN TRANSACTION;");
        m_impl->exec("ALTER TABLE files RENAME TO files_old;");
        m_impl->exec(R"(
            CREATE TABLE files (
                id INTEGER NOT NULL,
                scan_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                extension TEXT DEFAULT '',
                size INTEGER DEFAULT 0,
                modified_time INTEGER DEFAULT 0,
                is_directory INTEGER DEFAULT 0,
                hash TEXT DEFAULT '',
                parent_id INTEGER DEFAULT -1,
                PRIMARY KEY (scan_id, id),
                FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
            );
        )");
        m_impl->exec(
            "INSERT INTO files (id, scan_id, path, name, extension, size, modified_time, is_directory, hash, parent_id) "
            "SELECT id, scan_id, path, name, extension, size, modified_time, is_directory, hash, parent_id FROM files_old;");
        m_impl->exec("DROP TABLE files_old;");
        m_impl->exec("COMMIT;");
    }

    if (!table_has_column("duplicate_files", "scan_id"))
    {
        m_impl->exec("BEGIN TRANSACTION;");
        m_impl->exec("ALTER TABLE duplicate_files RENAME TO duplicate_files_old;");
        m_impl->exec(R"(
            CREATE TABLE duplicate_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                scan_id INTEGER NOT NULL,
                file_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                FOREIGN KEY (group_id) REFERENCES duplicate_groups(id) ON DELETE CASCADE,
                FOREIGN KEY (scan_id, file_id) REFERENCES files(scan_id, id) ON DELETE CASCADE
            );
        )");
        m_impl->exec(
            "INSERT INTO duplicate_files (group_id, scan_id, file_id, path) "
            "SELECT df.group_id, dg.scan_id, df.file_id, df.path "
            "FROM duplicate_files_old df "
            "INNER JOIN duplicate_groups dg ON dg.id = df.group_id;");
        m_impl->exec("DROP TABLE duplicate_files_old;");
        m_impl->exec("COMMIT;");
    }

    m_impl->exec("CREATE INDEX IF NOT EXISTS idx_files_scan ON files(scan_id);");
    m_impl->exec("CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);");
    m_impl->exec("CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);");
    m_impl->exec("CREATE INDEX IF NOT EXISTS idx_dup_groups_scan ON duplicate_groups(scan_id);");
    m_impl->exec("CREATE INDEX IF NOT EXISTS idx_dup_files_scan ON duplicate_files(scan_id);");

    // Migration: the 'size' column now stores actual disk consumption
    // (st_blocks * 512) rather than apparent file size.  No schema change
    // is required because the column type (INTEGER) is unchanged; only the
    // semantic meaning of stored values differs.  Old rows from previous
    // scans will still contain apparent-size values — re-scan to get
    // disk-consumption values.
}

int64_t Database::create_scan(const std::string &root_path)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    sqlite3_stmt *stmt;
    const char *sql = "INSERT INTO scans (root_path, status) VALUES (?, 'running');";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_text(stmt, 1, root_path.c_str(), -1, SQLITE_STATIC);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return sqlite3_last_insert_rowid(m_impl->db);
}

void Database::complete_scan(int64_t scan_id, const ScanResult &result)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    sqlite3_stmt *stmt;
    const char *sql = R"(
        UPDATE scans SET
            total_files = ?, total_directories = ?, total_size = ?,
            duplicate_groups = ?, duplicate_files = ?, wasted_space = ?,
            scan_duration = ?, status = 'completed'
        WHERE id = ?;
    )";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, result.total_files);
    sqlite3_bind_int64(stmt, 2, result.total_directories);
    sqlite3_bind_int64(stmt, 3, result.total_size);
    sqlite3_bind_int64(stmt, 4, result.duplicate_groups);
    sqlite3_bind_int64(stmt, 5, result.duplicate_files);
    sqlite3_bind_int64(stmt, 6, result.wasted_space);
    sqlite3_bind_double(stmt, 7, result.scan_duration);
    sqlite3_bind_int64(stmt, 8, scan_id);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
}

void Database::fail_scan(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    sqlite3_stmt *stmt;
    const char *sql = "UPDATE scans SET status = 'failed' WHERE id = ?;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
}

ScanResult Database::get_scan(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    ScanResult result{};
    sqlite3_stmt *stmt;
    const char *sql = "SELECT * FROM scans WHERE id = ?;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);

    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        result.scan_id = sqlite3_column_int64(stmt, 0);
        result.root_path = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
        result.total_files = sqlite3_column_int64(stmt, 2);
        result.total_directories = sqlite3_column_int64(stmt, 3);
        result.total_size = sqlite3_column_int64(stmt, 4);
        result.duplicate_groups = sqlite3_column_int64(stmt, 5);
        result.duplicate_files = sqlite3_column_int64(stmt, 6);
        result.wasted_space = sqlite3_column_int64(stmt, 7);
        const char *date = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 8));
        result.scan_date = date ? date : "";
        result.scan_duration = sqlite3_column_double(stmt, 9);
        const char *status = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 10));
        result.status = status ? status : "";
    }

    sqlite3_finalize(stmt);
    return result;
}

std::vector<ScanResult> Database::get_all_scans()
{
    std::lock_guard<std::mutex> lock(m_mutex);

    std::vector<ScanResult> results;
    sqlite3_stmt *stmt;
    const char *sql = "SELECT * FROM scans ORDER BY id DESC;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        ScanResult r{};
        r.scan_id = sqlite3_column_int64(stmt, 0);
        r.root_path = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
        r.total_files = sqlite3_column_int64(stmt, 2);
        r.total_directories = sqlite3_column_int64(stmt, 3);
        r.total_size = sqlite3_column_int64(stmt, 4);
        r.duplicate_groups = sqlite3_column_int64(stmt, 5);
        r.duplicate_files = sqlite3_column_int64(stmt, 6);
        r.wasted_space = sqlite3_column_int64(stmt, 7);
        const char *date = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 8));
        r.scan_date = date ? date : "";
        r.scan_duration = sqlite3_column_double(stmt, 9);
        const char *status = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 10));
        r.status = status ? status : "";
        results.push_back(r);
    }

    sqlite3_finalize(stmt);
    return results;
}

void Database::delete_scan(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    sqlite3_stmt *stmt;
    sqlite3_prepare_v2(m_impl->db, "DELETE FROM duplicate_files WHERE scan_id = ?;", -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    sqlite3_prepare_v2(m_impl->db, "DELETE FROM duplicate_groups WHERE scan_id = ?;", -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    sqlite3_prepare_v2(m_impl->db, "DELETE FROM files WHERE scan_id = ?;", -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    sqlite3_prepare_v2(m_impl->db, "DELETE FROM scans WHERE id = ?;", -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
}

void Database::insert_files(int64_t scan_id, const std::vector<FileEntry> &files)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    m_impl->exec("BEGIN TRANSACTION;");

    sqlite3_stmt *stmt;
    const char *sql = R"(
        INSERT INTO files (id, scan_id, path, name, extension, size, modified_time, is_directory, hash, parent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    )";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);

    for (const auto &f : files)
    {
        sqlite3_bind_int64(stmt, 1, f.id);
        sqlite3_bind_int64(stmt, 2, scan_id);
        sqlite3_bind_text(stmt, 3, f.path.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 4, f.name.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 5, f.extension.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_int64(stmt, 6, f.size);
        sqlite3_bind_int64(stmt, 7, f.modified_time);
        sqlite3_bind_int(stmt, 8, f.is_directory ? 1 : 0);
        sqlite3_bind_text(stmt, 9, f.hash.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_int64(stmt, 10, f.parent_id);
        sqlite3_step(stmt);
        sqlite3_reset(stmt);
    }

    sqlite3_finalize(stmt);
    m_impl->exec("COMMIT;");
}

std::vector<FileEntry> Database::get_files(int64_t scan_id, int64_t parent_id, int limit, int offset)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    std::vector<FileEntry> results;
    sqlite3_stmt *stmt;
    std::string sql;

    if (parent_id >= 0)
    {
        sql = "SELECT f.id, f.path, f.name, f.extension, f.size, "
              "f.modified_time, f.is_directory, f.hash, f.parent_id "
              "FROM files f WHERE f.scan_id = ? AND f.parent_id = ? "
              "ORDER BY f.is_directory DESC, f.name ASC LIMIT ? OFFSET ?;";
        sqlite3_prepare_v2(m_impl->db, sql.c_str(), -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, scan_id);
        sqlite3_bind_int64(stmt, 2, parent_id);
        sqlite3_bind_int(stmt, 3, limit);
        sqlite3_bind_int(stmt, 4, offset);
    }
    else
    {
        sql = "SELECT f.id, f.path, f.name, f.extension, f.size, "
              "f.modified_time, f.is_directory, f.hash, f.parent_id "
              "FROM files f WHERE f.scan_id = ? "
              "ORDER BY f.is_directory DESC, f.name ASC LIMIT ? OFFSET ?;";
        sqlite3_prepare_v2(m_impl->db, sql.c_str(), -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, scan_id);
        sqlite3_bind_int(stmt, 2, limit);
        sqlite3_bind_int(stmt, 3, offset);
    }

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        FileEntry f;
        f.id = sqlite3_column_int64(stmt, 0);
        f.path = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
        f.name = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 2));
        const char *ext = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 3));
        f.extension = ext ? ext : "";
        f.size = sqlite3_column_int64(stmt, 4);
        f.modified_time = sqlite3_column_int64(stmt, 5);
        f.is_directory = sqlite3_column_int(stmt, 6) != 0;
        const char *hash = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 7));
        f.hash = hash ? hash : "";
        f.parent_id = sqlite3_column_int64(stmt, 8);
        results.push_back(f);
    }

    sqlite3_finalize(stmt);
    return results;
}

std::vector<FileEntry> Database::search_files(int64_t scan_id, const std::string &query)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    std::vector<FileEntry> results;
    sqlite3_stmt *stmt;
    const char *sql = "SELECT f.id, f.path, f.name, f.extension, f.size, "
                      "f.modified_time, f.is_directory, f.hash, f.parent_id "
                      "FROM files f WHERE f.scan_id = ? AND f.name LIKE ? LIMIT 100;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    std::string pattern = "%" + query + "%";
    sqlite3_bind_text(stmt, 2, pattern.c_str(), -1, SQLITE_STATIC);

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        FileEntry f;
        f.id = sqlite3_column_int64(stmt, 0);
        f.path = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
        f.name = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 2));
        const char *ext = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 3));
        f.extension = ext ? ext : "";
        f.size = sqlite3_column_int64(stmt, 4);
        f.modified_time = sqlite3_column_int64(stmt, 5);
        f.is_directory = sqlite3_column_int(stmt, 6) != 0;
        const char *hash = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 7));
        f.hash = hash ? hash : "";
        f.parent_id = sqlite3_column_int64(stmt, 8);
        results.push_back(f);
    }

    sqlite3_finalize(stmt);
    return results;
}

void Database::store_duplicates(int64_t scan_id, const std::vector<DuplicateGroup> &groups)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    m_impl->exec("BEGIN TRANSACTION;");

    for (const auto &group : groups)
    {
        sqlite3_stmt *stmt;
        const char *sql = "INSERT INTO duplicate_groups (scan_id, hash, file_size, file_count, wasted_space) VALUES (?, ?, ?, ?, ?);";
        sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, scan_id);
        sqlite3_bind_text(stmt, 2, group.hash.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_int64(stmt, 3, group.file_size);
        sqlite3_bind_int(stmt, 4, static_cast<int>(group.files.size()));
        sqlite3_bind_int64(stmt, 5, group.wasted_space);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        int64_t group_id = sqlite3_last_insert_rowid(m_impl->db);

        for (const auto &file : group.files)
        {
            const char *fsql = "INSERT INTO duplicate_files (group_id, scan_id, file_id, path) VALUES (?, ?, ?, ?);";
            sqlite3_prepare_v2(m_impl->db, fsql, -1, &stmt, nullptr);
            sqlite3_bind_int64(stmt, 1, group_id);
            sqlite3_bind_int64(stmt, 2, scan_id);
            sqlite3_bind_int64(stmt, 3, file.id);
            sqlite3_bind_text(stmt, 4, file.path.c_str(), -1, SQLITE_STATIC);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    }

    m_impl->exec("COMMIT;");
}

std::vector<DuplicateGroup> Database::get_duplicates(int64_t scan_id, int limit, int offset)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    std::vector<DuplicateGroup> results;
    sqlite3_stmt *stmt;
    const char *sql = "SELECT id, hash, file_size, wasted_space FROM duplicate_groups WHERE scan_id = ? ORDER BY wasted_space DESC LIMIT ? OFFSET ?;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    sqlite3_bind_int(stmt, 2, limit);
    sqlite3_bind_int(stmt, 3, offset);

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        DuplicateGroup group;
        int64_t group_id = sqlite3_column_int64(stmt, 0);
        group.hash = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
        group.file_size = sqlite3_column_int64(stmt, 2);
        group.wasted_space = sqlite3_column_int64(stmt, 3);

        // Get files for this group
        sqlite3_stmt *fstmt;
        const char *fsql = "SELECT df.file_id, df.path, f.name, f.extension, f.size, f.modified_time FROM duplicate_files df LEFT JOIN files f ON f.scan_id = df.scan_id AND f.id = df.file_id WHERE df.group_id = ?;";
        sqlite3_prepare_v2(m_impl->db, fsql, -1, &fstmt, nullptr);
        sqlite3_bind_int64(fstmt, 1, group_id);

        while (sqlite3_step(fstmt) == SQLITE_ROW)
        {
            FileEntry f;
            f.id = sqlite3_column_int64(fstmt, 0);
            f.path = reinterpret_cast<const char *>(sqlite3_column_text(fstmt, 1));
            const char *name = reinterpret_cast<const char *>(sqlite3_column_text(fstmt, 2));
            f.name = name ? name : "";
            const char *ext = reinterpret_cast<const char *>(sqlite3_column_text(fstmt, 3));
            f.extension = ext ? ext : "";
            f.size = sqlite3_column_int64(fstmt, 4);
            f.modified_time = sqlite3_column_int64(fstmt, 5);
            f.is_directory = false;
            f.hash = group.hash;
            group.files.push_back(f);
        }
        sqlite3_finalize(fstmt);

        results.push_back(group);
    }

    sqlite3_finalize(stmt);
    return results;
}

uint64_t Database::get_duplicate_count(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    sqlite3_stmt *stmt;
    const char *sql = "SELECT COUNT(*) FROM duplicate_groups WHERE scan_id = ?;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    uint64_t count = 0;
    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        count = sqlite3_column_int64(stmt, 0);
    }
    sqlite3_finalize(stmt);
    return count;
}

std::vector<FileTypeStats> Database::get_file_type_stats(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    std::vector<FileTypeStats> results;
    sqlite3_stmt *stmt;
    const char *sql = "SELECT extension, COUNT(*), SUM(size) FROM files WHERE scan_id = ? AND is_directory = 0 GROUP BY extension ORDER BY SUM(size) DESC LIMIT 20;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        FileTypeStats s;
        const char *ext = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 0));
        s.extension = ext ? ext : "(no extension)";
        if (s.extension.empty())
            s.extension = "(no extension)";
        s.count = sqlite3_column_int64(stmt, 1);
        s.total_size = sqlite3_column_int64(stmt, 2);
        results.push_back(s);
    }

    sqlite3_finalize(stmt);
    return results;
}

void Database::delete_files_by_paths(int64_t scan_id, const std::vector<std::string> &paths)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    m_impl->exec("BEGIN TRANSACTION;");

    for (const auto &path : paths)
    {
        // Remove from duplicate_files first
        sqlite3_stmt *stmt;
        const char *sql = "DELETE FROM duplicate_files WHERE path = ? AND scan_id = ?;";
        sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_int64(stmt, 2, scan_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        // Remove from files table
        const char *sql2 = "DELETE FROM files WHERE scan_id = ? AND path = ?;";
        sqlite3_prepare_v2(m_impl->db, sql2, -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, scan_id);
        sqlite3_bind_text(stmt, 2, path.c_str(), -1, SQLITE_STATIC);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    // Clean up empty duplicate groups (groups with 0 or 1 file remaining)
    {
        sqlite3_stmt *stmt;
        const char *sql = "DELETE FROM duplicate_files WHERE group_id IN "
                          "(SELECT dg.id FROM duplicate_groups dg "
                          "LEFT JOIN duplicate_files df ON df.group_id = dg.id "
                          "WHERE dg.scan_id = ? "
                          "GROUP BY dg.id HAVING COUNT(df.id) <= 1);";
        sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, scan_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        const char *sql2 = "DELETE FROM duplicate_groups WHERE scan_id = ? AND id NOT IN "
                           "(SELECT DISTINCT group_id FROM duplicate_files);";
        sqlite3_prepare_v2(m_impl->db, sql2, -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, scan_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    m_impl->exec("COMMIT;");
}

void Database::delete_duplicate_group(int64_t scan_id, const std::string &hash, const std::string &keep_path)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    m_impl->exec("BEGIN TRANSACTION;");

    // Get group id
    sqlite3_stmt *stmt;
    const char *sql = "SELECT id FROM duplicate_groups WHERE scan_id = ? AND hash = ?;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_STATIC);

    int64_t group_id = -1;
    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        group_id = sqlite3_column_int64(stmt, 0);
    }
    sqlite3_finalize(stmt);

    if (group_id < 0)
    {
        m_impl->exec("COMMIT;");
        return;
    }

    // Get paths of files to delete (all except keep_path)
    const char *sql2 = "SELECT path FROM duplicate_files WHERE group_id = ? AND path != ?;";
    sqlite3_prepare_v2(m_impl->db, sql2, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, group_id);
    sqlite3_bind_text(stmt, 2, keep_path.c_str(), -1, SQLITE_STATIC);

    std::vector<std::string> paths_to_delete;
    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        const char *p = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 0));
        if (p)
            paths_to_delete.push_back(p);
    }
    sqlite3_finalize(stmt);

    // Remove deleted files from files table
    for (const auto &path : paths_to_delete)
    {
        const char *sql3 = "DELETE FROM files WHERE scan_id = ? AND path = ?;";
        sqlite3_prepare_v2(m_impl->db, sql3, -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, scan_id);
        sqlite3_bind_text(stmt, 2, path.c_str(), -1, SQLITE_STATIC);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    // Remove the entire duplicate group (since we keep only one, it's no longer a duplicate)
    const char *sql4 = "DELETE FROM duplicate_files WHERE group_id = ?;";
    sqlite3_prepare_v2(m_impl->db, sql4, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, group_id);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    const char *sql5 = "DELETE FROM duplicate_groups WHERE id = ?;";
    sqlite3_prepare_v2(m_impl->db, sql5, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, group_id);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    m_impl->exec("COMMIT;");
}

uint64_t Database::get_total_size(int64_t scan_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    sqlite3_stmt *stmt;
    const char *sql = "SELECT COALESCE(SUM(size), 0) FROM files WHERE scan_id = ? AND is_directory = 0;";
    sqlite3_prepare_v2(m_impl->db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, scan_id);
    uint64_t total = 0;
    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        total = sqlite3_column_int64(stmt, 0);
    }
    sqlite3_finalize(stmt);
    return total;
}
