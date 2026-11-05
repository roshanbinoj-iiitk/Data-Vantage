#include "scan_job.h"

#include "hasher.h"

#include <algorithm>
#include <iostream>
#include <thread>
#include <unordered_map>

ScanJob::ScanJob(int64_t scan_id, std::string root, ScanJobOptions options)
    : m_scan_id(scan_id), m_root(std::move(root)), m_options(std::move(options))
{
}

void ScanJob::cancel()
{
    m_cancel = true;
    m_scanner.stop();
}

void ScanJob::cancel_and_delete()
{
    m_delete = true;
    cancel();
}

void ScanJob::set_status(const std::string &status)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_status = status;
}

ScanProgress ScanJob::progress(std::string &status) const
{
    ScanProgress p;
    std::chrono::steady_clock::time_point hash_start;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        status = m_status;
        hash_start = m_hash_start;
        p = status == "scanning" ? m_scanner.get_progress() : m_walk_progress;
        p.duplicates_found = m_duplicates_found;
    }
    const bool running = !m_finished.load();
    p.is_scanning = running;
    const auto now = std::chrono::steady_clock::now();
    if (running)
        p.elapsed_seconds = std::chrono::duration<double>(now - m_start).count();

    if (running && status == "hashing")
    {
        const uint64_t done = m_hash_done.load();
        const uint64_t total = m_hash_total.load();
        const double elapsed = std::chrono::duration<double>(now - hash_start).count();
        if (done > 0 && total > done && elapsed > 0)
            p.estimated_seconds_remaining = static_cast<double>(total - done) / (static_cast<double>(done) / elapsed);
    }
    return p;
}

void ScanJob::sum_directory_sizes(std::vector<FileEntry> &files)
{
    for (size_t i = files.size(); i-- > 1;)
    {
        const int64_t parent = files[i].parent_id;
        if (parent >= 0 && static_cast<size_t>(parent) < files.size())
        {
            files[static_cast<size_t>(parent)].disk_size += files[i].disk_size;
            files[static_cast<size_t>(parent)].size += files[i].size;
        }
    }
}

std::vector<DuplicateGroup> ScanJob::find_duplicates(std::vector<FileEntry> &files, const ScanJobOptions &options,
                                                     const std::atomic<bool> &cancel, std::atomic<uint64_t> *done,
                                                     std::atomic<uint64_t> *total)
{
    // Candidates share the same apparent size. (Disk usage isn't a reliable
    // proxy: sparse or compressed files differ.)
    std::unordered_map<uint64_t, std::vector<size_t>> by_size;
    for (size_t i = 0; i < files.size(); ++i)
    {
        if (!files[i].is_directory && files[i].size > 0)
            by_size[files[i].size].push_back(i);
    }

    std::vector<std::vector<size_t>> candidates;
    uint64_t to_hash = 0;
    for (auto &entry : by_size)
    {
        auto &indices = entry.second;
        if (indices.size() < 2)
            continue;
        if (options.skip_extensionless_binaries)
        {
            indices.erase(
                std::remove_if(indices.begin(), indices.end(),
                               [&](size_t i) { return files[i].extension.empty() && looks_binary(files[i].path); }),
                indices.end());
            if (indices.size() < 2)
                continue;
        }
        to_hash += indices.size();
        candidates.push_back(std::move(indices));
    }
    if (total)
        *total = to_hash;

    // Biggest files first so the slowest work starts early.
    std::sort(candidates.begin(), candidates.end(),
              [&](const auto &a, const auto &b) { return files[a[0]].size > files[b[0]].size; });

    std::vector<DuplicateGroup> result;
    std::mutex result_mutex;
    std::atomic<size_t> next{0};

    auto worker = [&]() {
        while (!cancel.load())
        {
            const size_t g = next.fetch_add(1);
            if (g >= candidates.size())
                return;
            const auto &indices = candidates[g];

            std::unordered_map<std::string, std::vector<size_t>> by_quick;
            for (size_t idx : indices)
            {
                if (cancel.load())
                    return;
                std::string h = Hasher::quick_hash(files[idx].path, files[idx].size);
                if (!h.empty())
                    by_quick[h].push_back(idx);
                if (done)
                    ++*done;
            }

            for (auto &q : by_quick)
            {
                if (q.second.size() < 2)
                    continue;
                std::unordered_map<std::string, std::vector<size_t>> by_full;
                for (size_t idx : q.second)
                {
                    if (cancel.load())
                        return;
                    std::string h = Hasher::hash_file(files[idx].path);
                    if (!h.empty())
                    {
                        files[idx].hash = h; // each index belongs to one worker
                        by_full[h].push_back(idx);
                    }
                }
                for (auto &f : by_full)
                {
                    if (f.second.size() < 2)
                        continue;
                    DuplicateGroup group;
                    group.hash = f.first;
                    group.file_size = files[f.second[0]].size;
                    uint64_t disk_total = 0, disk_max = 0;
                    for (size_t idx : f.second)
                    {
                        group.files.push_back(files[idx]);
                        disk_total += files[idx].disk_size;
                        disk_max = std::max(disk_max, files[idx].disk_size);
                    }
                    group.wasted_space = disk_total - disk_max;
                    std::lock_guard<std::mutex> lock(result_mutex);
                    result.push_back(std::move(group));
                }
            }
        }
    };

    unsigned threads = options.hash_threads;
    if (threads == 0)
        threads = std::clamp(std::thread::hardware_concurrency(), 1u, 8u);
    threads = static_cast<unsigned>(std::min<size_t>(threads, std::max<size_t>(candidates.size(), 1)));

    std::vector<std::thread> pool;
    for (unsigned t = 1; t < threads; ++t)
        pool.emplace_back(worker);
    worker();
    for (auto &t : pool)
        t.join();
    return result;
}

void ScanJob::run(Database &db)
{
    bool completed = false;
    try
    {
        m_scanner.scan(m_root, m_options.scan);

        if (!m_cancel.load())
        {
            {
                std::lock_guard<std::mutex> lock(m_mutex);
                m_walk_progress = m_scanner.get_progress();
                m_status = "hashing";
                m_hash_start = std::chrono::steady_clock::now();
            }

            std::vector<FileEntry> files = m_scanner.take_files();
            auto groups = find_duplicates(files, m_options, m_cancel, &m_hash_done, &m_hash_total);
            sum_directory_sizes(files);

            uint64_t dup_files = 0, wasted = 0;
            for (const auto &g : groups)
            {
                dup_files += g.files.size();
                wasted += g.wasted_space;
            }
            {
                std::lock_guard<std::mutex> lock(m_mutex);
                m_duplicates_found = groups.size();
            }

            if (!m_cancel.load())
            {
                set_status("saving");
                db.insert_files(m_scan_id, files);
                db.store_duplicates(m_scan_id, groups);

                ScanResult result;
                result.scan_id = m_scan_id;
                result.root_path = m_root;
                result.total_files = m_walk_progress.files_scanned;
                result.total_directories = m_walk_progress.directories_scanned;
                result.total_size = files.empty() ? 0 : files[0].disk_size;
                result.duplicate_groups = groups.size();
                result.duplicate_files = dup_files;
                result.wasted_space = wasted;
                result.scan_duration =
                    std::chrono::duration<double>(std::chrono::steady_clock::now() - m_start).count();
                db.complete_scan(result);
                set_status("completed");
                completed = true;
            }
            // `files` (the whole tree) is freed here, not kept until the
            // scan is deleted.
        }

        if (!completed && m_cancel.load())
        {
            {
                std::lock_guard<std::mutex> lock(m_mutex);
                if (m_status == "scanning")
                    m_walk_progress = m_scanner.get_progress();
                m_status = "cancelled";
            }
            db.set_scan_status(m_scan_id, "cancelled");
        }
    }
    catch (const std::exception &e)
    {
        std::cerr << "Scan " << m_scan_id << " failed: " << e.what() << std::endl;
        set_status("failed");
        try
        {
            db.set_scan_status(m_scan_id, "failed");
        }
        catch (...)
        {
        }
    }

    if (m_delete.load())
    {
        try
        {
            db.delete_scan(m_scan_id);
        }
        catch (const std::exception &e)
        {
            std::cerr << "Failed to delete scan " << m_scan_id << ": " << e.what() << std::endl;
        }
    }
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_walk_progress.elapsed_seconds =
            std::chrono::duration<double>(std::chrono::steady_clock::now() - m_start).count();
    }
    m_finished = true;
}
