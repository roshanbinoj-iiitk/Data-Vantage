#pragma once

#include <string>
#include <vector>
#include <cstdint>

class Hasher
{
public:
    // Fast hash using xxHash algorithm (implemented inline)
    static std::string hash_file(const std::string &filepath, uint64_t file_size = 0);

    // Quick hash - only hashes first and last 4KB + file size for fast comparison
    static std::string quick_hash(const std::string &filepath, uint64_t file_size);

    // Full SHA256 hash for verification
    static std::string sha256_file(const std::string &filepath);

private:
    static constexpr size_t BUFFER_SIZE = 65536;    // 64KB read buffer
    static constexpr size_t QUICK_HASH_SIZE = 4096; // 4KB for quick hash
};
