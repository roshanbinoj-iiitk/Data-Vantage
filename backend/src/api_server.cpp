#include "api_server.h"

#include "database.h"
#include "file_actions.h"
#include "json_api.h"
#include "paths.h"
#include "scan_job.h"

#include "httplib.h"
#include <nlohmann/json.hpp>

#include <algorithm>
#include <charconv>
#include <fcntl.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <mutex>
#include <optional>
#include <sstream>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>

using nlohmann::json;
namespace fs = std::filesystem;

namespace
{
    constexpr const char *TOKEN_HEADER = "X-Data-Vantage-Token";

    // Thrown by handlers to produce a JSON error response.
    struct HttpError : std::runtime_error
    {
        int status;
        HttpError(int s, const std::string &msg) : std::runtime_error(msg), status(s) {}
    };

    void send_json(httplib::Response &res, const json &body, int status = 200)
    {
        res.status = status;
        res.set_content(body.dump(), "application/json");
    }

    void send_error(httplib::Response &res, int status, const std::string &msg)
    {
        send_json(res, {{"error", msg}}, status);
    }

    std::optional<int64_t> to_int(const std::string &s)
    {
        int64_t v = 0;
        const char *end = s.data() + s.size();
        auto [ptr, ec] = std::from_chars(s.data(), end, v);
        if (ec != std::errc() || ptr != end)
            return std::nullopt;
        return v;
    }

    int64_t path_id(const httplib::Request &req, size_t index)
    {
        auto v = to_int(req.matches[index]);
        if (!v)
            throw HttpError(400, "Invalid id in URL");
        return *v;
    }

    int64_t query_int(const httplib::Request &req, const char *name, int64_t fallback, int64_t min, int64_t max)
    {
        if (!req.has_param(name))
            return fallback;
        auto v = to_int(req.get_param_value(name));
        if (!v || *v < min || *v > max)
            throw HttpError(400, std::string("Invalid '") + name + "' parameter");
        return *v;
    }

    std::string query_choice(const httplib::Request &req, const char *name, const std::string &fallback,
                             std::initializer_list<const char *> allowed)
    {
        if (!req.has_param(name))
            return fallback;
        const std::string v = req.get_param_value(name);
        for (const char *a : allowed)
            if (v == a)
                return v;
        throw HttpError(400, std::string("Invalid '") + name + "' parameter");
    }

    SortOrder query_order(const httplib::Request &req, SortOrder fallback)
    {
        const std::string v = query_choice(req, "order", fallback == SortOrder::Asc ? "asc" : "desc", {"asc", "desc"});
        return v == "asc" ? SortOrder::Asc : SortOrder::Desc;
    }

    json parse_body(const httplib::Request &req)
    {
        json body = json::parse(req.body, nullptr, false);
        if (body.is_discarded() || !body.is_object())
            throw HttpError(400, "Request body must be a JSON object");
        return body;
    }

    std::vector<int64_t> id_array(const json &body, const char *key)
    {
        auto it = body.find(key);
        if (it == body.end() || !it->is_array() || it->empty())
            throw HttpError(400, std::string("'") + key + "' must be a non-empty array of ids");
        std::vector<int64_t> ids;
        for (const auto &v : *it)
        {
            if (!v.is_number_integer())
                throw HttpError(400, std::string("'") + key + "' must contain integers");
            ids.push_back(v.get<int64_t>());
        }
        return ids;
    }

    bool read_file_text(const std::string &path, std::string &out)
    {
        std::ifstream file(path, std::ios::binary);
        if (!file)
            return false;
        std::ostringstream buf;
        buf << file.rdbuf();
        out = buf.str();
        return true;
    }

    std::string random_token()
    {
        unsigned char bytes[32];
        std::ifstream urandom("/dev/urandom", std::ios::binary);
        if (!urandom.read(reinterpret_cast<char *>(bytes), sizeof(bytes)))
            throw std::runtime_error("cannot read /dev/urandom");
        static const char hex[] = "0123456789abcdef";
        std::string out;
        for (unsigned char b : bytes)
        {
            out += hex[b >> 4];
            out += hex[b & 0xF];
        }
        return out;
    }

    bool constant_time_equal(const std::string &a, const std::string &b)
    {
        if (a.size() != b.size())
            return false;
        unsigned char diff = 0;
        for (size_t i = 0; i < a.size(); ++i)
            diff |= static_cast<unsigned char>(a[i] ^ b[i]);
        return diff == 0;
    }

    json trash_outcome_json(const TrashOutcome &o)
    {
        json failed = json::array();
        for (const auto &[path, reason] : o.failed)
            failed.push_back({{"path", path}, {"reason", reason}});
        return {
            {"deleted", o.trashed},
            {"failed", failed},
            {"deletedCount", o.trashed.size()},
            {"failedCount", o.failed.size()},
        };
    }

    std::string normalize_root(std::string path)
    {
        std::error_code ec;
        auto canon = fs::weakly_canonical(path, ec);
        if (!ec)
            path = canon.string();
        while (path.size() > 1 && path.back() == '/')
            path.pop_back();
        return path;
    }
} // namespace

bool is_loopback_host(const std::string &host)
{
    return host == "127.0.0.1" || host == "::1" || host == "localhost" || host.rfind("127.", 0) == 0;
}

bool host_header_allowed(const std::string &host_header, int port)
{
    const std::string p = std::to_string(port);
    for (const char *name : {"127.0.0.1", "localhost", "[::1]"})
    {
        const std::string n = name;
        if (host_header == n || host_header == n + ":" + p)
            return true;
    }
    return false;
}

struct ApiServer::Impl
{
    ServerConfig config;
    httplib::Server server;
    Database db;
    std::string token;

    struct Job
    {
        std::shared_ptr<ScanJob> job;
        std::thread thread;
    };
    std::mutex jobs_mutex;
    std::map<int64_t, Job> jobs;

    explicit Impl(const ServerConfig &cfg)
        : config(cfg), db(cfg.db_path.empty() ? app_data_dir() + "/data_vantage.db" : cfg.db_path),
          token(cfg.token.empty() ? random_token() : cfg.token)
    {
        db.mark_interrupted_scans();
        write_token_file();
        setup_routes();
    }

    ~Impl()
    {
        // Cancel and join every worker before `db` is destroyed, so no
        // thread outlives the objects it uses.
        std::lock_guard<std::mutex> lock(jobs_mutex);
        for (auto &[id, j] : jobs)
            j.job->cancel();
        for (auto &[id, j] : jobs)
            if (j.thread.joinable())
                j.thread.join();
        if (!token_path().empty())
            ::unlink(token_path().c_str());
    }

    std::string token_path() const
    {
        return config.token_file.empty() ? app_runtime_dir() + "/token" : config.token_file;
    }

    // The Vite dev server reads this file to forward the token.
    void write_token_file()
    {
        const std::string path = token_path();
        const int fd = ::open(path.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0600);
        if (fd < 0)
        {
            std::cerr << "Warning: cannot write token file " << path << std::endl;
            return;
        }
        ::fchmod(fd, 0600);
        if (::write(fd, token.data(), token.size()) != static_cast<ssize_t>(token.size()))
            std::cerr << "Warning: cannot write token file " << path << std::endl;
        ::close(fd);
    }

    // Joins workers that are done; called with jobs_mutex held.
    void reap_finished_jobs()
    {
        for (auto it = jobs.begin(); it != jobs.end();)
        {
            if (it->second.job->finished())
            {
                if (it->second.thread.joinable())
                    it->second.thread.join();
                it = jobs.erase(it);
            }
            else
            {
                ++it;
            }
        }
    }

    std::shared_ptr<ScanJob> find_job(int64_t scan_id)
    {
        std::lock_guard<std::mutex> lock(jobs_mutex);
        auto it = jobs.find(scan_id);
        if (it == jobs.end() || it->second.job->finished())
            return nullptr;
        return it->second.job;
    }

    ScanResult require_scan(int64_t scan_id)
    {
        auto scan = db.get_scan(scan_id);
        if (!scan)
            throw HttpError(404, "Scan not found");
        return *scan;
    }

    ScanResult require_completed_scan(int64_t scan_id)
    {
        ScanResult scan = require_scan(scan_id);
        if (scan.status != "completed")
            throw HttpError(409, "Scan is not completed");
        return scan;
    }

    std::string index_html_with_token()
    {
        std::string html;
        if (!read_file_text(config.web_root + "/index.html", html))
            return "";
        const std::string tag = "<script>window.__DATA_VANTAGE_TOKEN__=\"" + token + "\";</script>";
        auto pos = html.find("</head>");
        if (pos == std::string::npos)
            return tag + html;
        return html.insert(pos, tag);
    }

    bool serve_index(httplib::Response &res)
    {
        std::string html = index_html_with_token();
        if (html.empty())
            return false;
        res.status = 200;
        res.set_header("Cache-Control", "no-store");
        res.set_content(html, "text/html");
        return true;
    }

    void setup_routes()
    {
        const bool check_host = is_loopback_host(config.host);
        const bool have_web = !config.web_root.empty() && fs::exists(config.web_root + "/index.html");

        // ---- Request checks (run before anything else) -----------------------
        server.set_pre_routing_handler(
            [this, check_host, have_web](const httplib::Request &req, httplib::Response &res) {
                using HR = httplib::Server::HandlerResponse;
                // Reject DNS-rebinding requests: the Host must be this server.
                if (check_host && !host_header_allowed(req.get_header_value("Host"), config.port))
                {
                    send_error(res, 403, "Unexpected Host header");
                    return HR::Handled;
                }

                const bool is_api = req.path.rfind("/api/", 0) == 0;
                if (!is_api)
                {
                    // The page itself carries the token, so it is generated here
                    // rather than served as a static file.
                    if (have_web && req.method == "GET" && (req.path == "/" || req.path == "/index.html"))
                        return serve_index(res) ? HR::Handled : HR::Unhandled;
                    return HR::Unhandled;
                }
                if (req.path == "/api/health")
                    return HR::Unhandled;

                if (!constant_time_equal(req.get_header_value(TOKEN_HEADER), token))
                {
                    send_error(res, 401, "Missing or invalid API token");
                    return HR::Handled;
                }
                if (req.method != "GET" && req.method != "HEAD")
                {
                    // Forces a CORS preflight for any cross-site request.
                    const std::string ct = req.get_header_value("Content-Type");
                    if (ct.rfind("application/json", 0) != 0)
                    {
                        send_error(res, 415, "Content-Type must be application/json");
                        return HR::Handled;
                    }
                }
                return HR::Unhandled;
            });

        server.set_exception_handler([](const httplib::Request &, httplib::Response &res, std::exception_ptr ep) {
            try
            {
                std::rethrow_exception(ep);
            }
            catch (const HttpError &e)
            {
                send_error(res, e.status, e.what());
            }
            catch (const std::exception &e)
            {
                std::cerr << "Request failed: " << e.what() << std::endl;
                send_error(res, 500, e.what());
            }
            catch (...)
            {
                send_error(res, 500, "Internal error");
            }
        });

        server.Get("/api/health", [](const httplib::Request &, httplib::Response &res) {
            send_json(res, {{"status", "ok"}, {"service", "Data-Vantage"}});
        });

        server.Post("/api/pick-directory", [](const httplib::Request &, httplib::Response &res) {
            send_json(res, {{"path", pick_directory()}});
        });

        // ---- Scans -------------------------------------------------------------

        server.Post("/api/scans", [this](const httplib::Request &req, httplib::Response &res) {
            json body = parse_body(req);
            if (!body.contains("path") || !body["path"].is_string() || body["path"].get<std::string>().empty())
                throw HttpError(400, "Missing 'path' in request body");
            std::string path = body["path"].get<std::string>();
            if (path[0] != '/')
                throw HttpError(400, "Path must be absolute");
            std::error_code ec;
            if (!fs::is_directory(path, ec))
                throw HttpError(400, "Path does not exist or is not a folder");
            path = normalize_root(path);

            std::vector<std::string> exclusions = ExclusionMatcher::defaults();
            if (body.contains("exclusions"))
            {
                if (!body["exclusions"].is_array())
                    throw HttpError(400, "'exclusions' must be an array of strings");
                exclusions.clear();
                for (const auto &e : body["exclusions"])
                {
                    if (!e.is_string())
                        throw HttpError(400, "'exclusions' must be an array of strings");
                    exclusions.push_back(e.get<std::string>());
                }
            }
            uint64_t min_size = 0;
            if (body.contains("minSize"))
            {
                if (!body["minSize"].is_number_integer() || body["minSize"].get<int64_t>() < 0)
                    throw HttpError(400, "'minSize' must be a non-negative integer");
                min_size = body["minSize"].get<uint64_t>();
            }

            ScanJobOptions options;
            options.scan.min_size = min_size;
            options.scan.exclusions = ExclusionMatcher(exclusions);
            options.skip_extensionless_binaries = body.value("skipExtensionlessBinaries", false);
            options.hash_threads = config.hash_threads;

            const int64_t scan_id = db.create_scan(path, exclusions, min_size);
            auto job = std::make_shared<ScanJob>(scan_id, path, std::move(options));
            {
                std::lock_guard<std::mutex> lock(jobs_mutex);
                reap_finished_jobs();
                Job &slot = jobs[scan_id];
                slot.job = job;
                slot.thread = std::thread([this, job] { job->run(db); });
            }
            send_json(res, {{"scanId", scan_id}, {"status", "started"}}, 201);
        });

        server.Get("/api/scans", [this](const httplib::Request &, httplib::Response &res) {
            {
                std::lock_guard<std::mutex> lock(jobs_mutex);
                reap_finished_jobs();
            }
            json arr = json::array();
            for (const auto &s : db.get_all_scans())
                arr.push_back(to_json(s));
            send_json(res, arr);
        });

        server.Get(R"(/api/scans/(\d+))", [this](const httplib::Request &req, httplib::Response &res) {
            send_json(res, to_json(require_scan(path_id(req, 1))));
        });

        server.Delete(R"(/api/scans/(\d+))", [this](const httplib::Request &req, httplib::Response &res) {
            const int64_t scan_id = path_id(req, 1);
            require_scan(scan_id);
            if (auto job = find_job(scan_id))
                job->cancel_and_delete(); // the worker deletes again once it stops writing
            db.delete_scan(scan_id);
            send_json(res, {{"status", "deleted"}});
        });

        server.Get(R"(/api/scans/(\d+)/progress)", [this](const httplib::Request &req, httplib::Response &res) {
            const int64_t scan_id = path_id(req, 1);
            if (auto job = find_job(scan_id))
            {
                std::string status;
                ScanProgress p = job->progress(status);
                send_json(res, to_json(p, status));
                return;
            }
            const ScanResult scan = require_scan(scan_id);
            ScanProgress p;
            p.files_scanned = scan.total_files;
            p.directories_scanned = scan.total_directories;
            p.total_size = scan.total_size;
            p.duplicates_found = scan.duplicate_groups;
            p.is_scanning = false;
            p.elapsed_seconds = scan.scan_duration;
            p.estimated_seconds_remaining = 0;
            send_json(res, to_json(p, scan.status));
        });

        server.Post(R"(/api/scans/(\d+)/stop)", [this](const httplib::Request &req, httplib::Response &res) {
            auto job = find_job(path_id(req, 1));
            if (!job)
                throw HttpError(404, "Active scan not found");
            job->cancel();
            send_json(res, {{"status", "stopping"}});
        });

        // ---- Files -------------------------------------------------------------

        server.Get(R"(/api/scans/(\d+)/files)", [this](const httplib::Request &req, httplib::Response &res) {
            const int64_t scan_id = path_id(req, 1);
            require_completed_scan(scan_id);
            FileQuery q;
            q.parent_id = query_int(req, "parentId", 0, 0, INT64_MAX);
            q.sort = query_choice(req, "sort", "name", {"name", "size", "extension", "modified"});
            q.order = query_order(req, q.sort == "size" || q.sort == "modified" ? SortOrder::Desc : SortOrder::Asc);
            q.limit = static_cast<int>(query_int(req, "limit", 100, 1, 1000));
            q.offset = static_cast<int>(query_int(req, "offset", 0, 0, INT32_MAX));
            auto page = db.get_files(scan_id, q);
            json items = json::array();
            for (const auto &f : page.items)
                items.push_back(to_json(f));
            send_json(res, {{"total", page.total}, {"items", items}});
        });

        // A single entry plus its ancestors (root first), for breadcrumbs.
        server.Get(R"(/api/scans/(\d+)/files/(\d+))", [this](const httplib::Request &req, httplib::Response &res) {
            const int64_t scan_id = path_id(req, 1);
            require_completed_scan(scan_id);
            auto chain = db.get_ancestors(scan_id, path_id(req, 2));
            if (chain.empty())
                throw HttpError(404, "File not found");
            json ancestors = json::array();
            for (size_t i = 0; i + 1 < chain.size(); ++i)
                ancestors.push_back(to_json(chain[i]));
            send_json(res, {{"entry", to_json(chain.back())}, {"ancestors", ancestors}});
        });

        server.Get(R"(/api/scans/(\d+)/search)", [this](const httplib::Request &req, httplib::Response &res) {
            const int64_t scan_id = path_id(req, 1);
            require_completed_scan(scan_id);
            const std::string q = req.has_param("q") ? req.get_param_value("q") : "";
            if (q.empty())
                throw HttpError(400, "Missing 'q' query parameter");
            json arr = json::array();
            for (const auto &f : db.search_files(scan_id, q, static_cast<int>(query_int(req, "limit", 100, 1, 1000))))
                arr.push_back(to_json(f));
            send_json(res, arr);
        });

        // Moves files to the trash. Body: {"ids": [fileId, ...]}
        server.Post(R"(/api/scans/(\d+)/files/delete)", [this](const httplib::Request &req, httplib::Response &res) {
            const int64_t scan_id = path_id(req, 1);
            const ScanResult scan = require_completed_scan(scan_id);
            const auto ids = id_array(parse_body(req), "ids");

            std::vector<FileEntry> entries;
            TrashOutcome unknown;
            for (int64_t id : ids)
            {
                if (auto f = db.get_file(scan_id, id))
                    entries.push_back(std::move(*f));
                else
                    unknown.failed.emplace_back("#" + std::to_string(id), "not part of this scan");
            }
            TrashOutcome outcome = trash_scanned_files(scan, entries);
            outcome.failed.insert(outcome.failed.end(), unknown.failed.begin(), unknown.failed.end());
            db.remove_files(scan_id, outcome.removed_ids);
            send_json(res, trash_outcome_json(outcome));
        });

        // Keeps one copy of a duplicate group and moves the others to the trash.
        // Body: {"keepId": fileId}
        server.Post(R"(/api/scans/(\d+)/duplicates/(\d+)/keep)",
                    [this](const httplib::Request &req, httplib::Response &res) {
                        const int64_t scan_id = path_id(req, 1);
                        const ScanResult scan = require_completed_scan(scan_id);
                        json body = parse_body(req);
                        if (!body.contains("keepId") || !body["keepId"].is_number_integer())
                            throw HttpError(400, "Missing 'keepId' in request body");
                        const int64_t keep_id = body["keepId"].get<int64_t>();

                        auto group = db.get_duplicate_group(scan_id, path_id(req, 2));
                        if (!group)
                            throw HttpError(404, "Duplicate group not found");

                        const FileEntry *keep = nullptr;
                        std::vector<FileEntry> others;
                        for (const auto &f : group->files)
                        {
                            if (f.id == keep_id)
                                keep = &f;
                            else
                                others.push_back(f);
                        }
                        // Never delete anything unless the file to keep is really in the
                        // group and still intact on disk.
                        if (!keep)
                            throw HttpError(400, "'keepId' is not a member of this group");
                        std::string reason;
                        if (!unchanged_since_scan(*keep, reason))
                            throw HttpError(409, "The file to keep " + keep->path + " is " + reason);

                        TrashOutcome outcome = trash_scanned_files(scan, others, keep);
                        db.remove_files(scan_id, outcome.removed_ids);
                        json out = trash_outcome_json(outcome);
                        out["kept"] = keep->path;
                        send_json(res, out);
                    });

        auto file_action = [this](bool reveal) {
            return [this, reveal](const httplib::Request &req, httplib::Response &res) {
                const int64_t scan_id = path_id(req, 1);
                require_completed_scan(scan_id);
                auto f = db.get_file(scan_id, path_id(req, 2));
                if (!f)
                    throw HttpError(404, "File not found");
                std::error_code ec;
                if (!fs::exists(f->path, ec))
                    throw HttpError(410, "File no longer exists");
                const bool ok = reveal ? reveal_in_file_manager(f->path) : open_with_default_app(f->path);
                if (!ok)
                    throw HttpError(501, "No desktop helper available (xdg-open)");
                send_json(res, {{"status", "ok"}});
            };
        };
        server.Post(R"(/api/scans/(\d+)/files/(\d+)/open)", file_action(false));
        server.Post(R"(/api/scans/(\d+)/files/(\d+)/reveal)", file_action(true));

        // ---- Duplicates & stats -----------------------------------------------

        server.Get(R"(/api/scans/(\d+)/duplicates)", [this](const httplib::Request &req, httplib::Response &res) {
            const int64_t scan_id = path_id(req, 1);
            const ScanResult scan = require_completed_scan(scan_id);
            DuplicateQuery q;
            q.sort = query_choice(req, "sort", "wasted", {"wasted", "size", "count", "name", "path"});
            q.order = query_order(req, q.sort == "name" || q.sort == "path" ? SortOrder::Asc : SortOrder::Desc);
            q.filter = req.has_param("q") ? req.get_param_value("q") : "";
            q.limit = static_cast<int>(query_int(req, "limit", 50, 1, 500));
            q.offset = static_cast<int>(query_int(req, "offset", 0, 0, INT32_MAX));
            auto page = db.get_duplicates(scan_id, q);
            json groups = json::array();
            for (const auto &g : page.items)
                groups.push_back(to_json(g));
            send_json(res, {{"total", page.total}, {"exclusions", scan.exclusions}, {"groups", groups}});
        });

        server.Get(R"(/api/scans/(\d+)/stats)", [this](const httplib::Request &req, httplib::Response &res) {
            const int64_t scan_id = path_id(req, 1);
            require_completed_scan(scan_id);
            json arr = json::array();
            for (const auto &s : db.get_file_type_stats(scan_id))
                arr.push_back(to_json(s));
            send_json(res, arr);
        });

        // ---- Frontend ------------------------------------------------------------

        if (have_web)
        {
            if (!server.set_mount_point("/", config.web_root))
                std::cerr << "Warning: failed to serve web root " << config.web_root << std::endl;
            // Client-side routes (/dashboard, /files/3/...) get the app shell.
            server.set_error_handler([this](const httplib::Request &req, httplib::Response &res) {
                if (res.status == 404 && req.method == "GET" && req.path.rfind("/api/", 0) != 0 &&
                    req.path.find('.') == std::string::npos)
                    serve_index(res);
            });
        }
        else if (!config.web_root.empty())
        {
            std::cerr << "Warning: web root not found: " << config.web_root << " (serving the API only)" << std::endl;
        }
    }
};

ApiServer::ApiServer(const ServerConfig &config) : m_impl(std::make_unique<Impl>(config)) {}

ApiServer::~ApiServer()
{
    stop();
}

const std::string &ApiServer::token() const
{
    return m_impl->token;
}

void ApiServer::start()
{
    const auto &cfg = m_impl->config;
    if (!is_loopback_host(cfg.host))
        std::cerr << "Warning: listening on " << cfg.host
                  << " makes Data-Vantage reachable from other machines. Anyone with the API token can "
                     "delete files in scanned folders."
                  << std::endl;
    std::cout << "Data-Vantage listening on http://"
              << (cfg.host.find(':') != std::string::npos ? "[" + cfg.host + "]" : cfg.host) << ":" << cfg.port
              << std::endl;
    if (!m_impl->server.listen(cfg.host, cfg.port))
        throw std::runtime_error("Failed to bind " + cfg.host + ":" + std::to_string(cfg.port));
}

void ApiServer::stop()
{
    m_impl->server.stop();
}
