#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

class Hasher
{
  public:
    // XXH3-128 of the whole file, streamed in chunks. Returns "" on error.
    // This is a fast non-cryptographic hash; it's used to group candidate
    // duplicates, and files are compared byte by byte before any delete.
    static std::string hash_file(const std::string &filepath);

    // XXH3-128 of the first and last 4 KiB plus the size. Cheap pre-filter.
    static std::string quick_hash(const std::string &filepath, uint64_t file_size);

    // True if both files exist and have identical contents.
    static bool files_identical(const std::string &a, const std::string &b);

  private:
    static constexpr size_t BUFFER_SIZE = 1 << 20;  // 1 MiB read buffer
    static constexpr size_t QUICK_HASH_SIZE = 4096; // 4 KiB at each end
};
