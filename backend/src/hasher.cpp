#include "hasher.h"
#include <fstream>
#include <sstream>
#include <iomanip>
#include <cstring>
#include <array>

// ============================================================================
// Embedded xxHash implementation (xxHash64) - BSD 2-Clause License
// Based on xxHash by Yann Collet
// ============================================================================

namespace
{

    static const uint64_t PRIME64_1 = 0x9E3779B185EBCA87ULL;
    static const uint64_t PRIME64_2 = 0x14DEF9DEA2F79CD5ULL;
    static const uint64_t PRIME64_3 = 0x165667B19E3779F9ULL;
    static const uint64_t PRIME64_4 = 0x85EBCA77C2B2AE63ULL;
    static const uint64_t PRIME64_5 = 0x27D4EB2F165667C5ULL;

    inline uint64_t rotl64(uint64_t x, int r)
    {
        return (x << r) | (x >> (64 - r));
    }

    inline uint64_t xxh64_round(uint64_t acc, uint64_t input)
    {
        acc += input * PRIME64_2;
        acc = rotl64(acc, 31);
        acc *= PRIME64_1;
        return acc;
    }

    inline uint64_t xxh64_merge_round(uint64_t acc, uint64_t val)
    {
        val = xxh64_round(0, val);
        acc ^= val;
        acc = acc * PRIME64_1 + PRIME64_4;
        return acc;
    }

    uint64_t xxh64(const void *input, size_t len, uint64_t seed = 0)
    {
        const uint8_t *p = (const uint8_t *)input;
        const uint8_t *end = p + len;
        uint64_t h64;

        if (len >= 32)
        {
            const uint8_t *limit = end - 32;
            uint64_t v1 = seed + PRIME64_1 + PRIME64_2;
            uint64_t v2 = seed + PRIME64_2;
            uint64_t v3 = seed + 0;
            uint64_t v4 = seed - PRIME64_1;

            do
            {
                uint64_t k1;
                memcpy(&k1, p, 8);
                p += 8;
                v1 = xxh64_round(v1, k1);
                memcpy(&k1, p, 8);
                p += 8;
                v2 = xxh64_round(v2, k1);
                memcpy(&k1, p, 8);
                p += 8;
                v3 = xxh64_round(v3, k1);
                memcpy(&k1, p, 8);
                p += 8;
                v4 = xxh64_round(v4, k1);
            } while (p <= limit);

            h64 = rotl64(v1, 1) + rotl64(v2, 7) + rotl64(v3, 12) + rotl64(v4, 18);
            h64 = xxh64_merge_round(h64, v1);
            h64 = xxh64_merge_round(h64, v2);
            h64 = xxh64_merge_round(h64, v3);
            h64 = xxh64_merge_round(h64, v4);
        }
        else
        {
            h64 = seed + PRIME64_5;
        }

        h64 += (uint64_t)len;

        while (p + 8 <= end)
        {
            uint64_t k1;
            memcpy(&k1, p, 8);
            k1 = xxh64_round(0, k1);
            h64 ^= k1;
            h64 = rotl64(h64, 27) * PRIME64_1 + PRIME64_4;
            p += 8;
        }

        while (p + 4 <= end)
        {
            uint32_t k1;
            memcpy(&k1, p, 4);
            h64 ^= (uint64_t)k1 * PRIME64_1;
            h64 = rotl64(h64, 23) * PRIME64_2 + PRIME64_3;
            p += 4;
        }

        while (p < end)
        {
            h64 ^= (*p) * PRIME64_5;
            h64 = rotl64(h64, 11) * PRIME64_1;
            p++;
        }

        h64 ^= h64 >> 33;
        h64 *= PRIME64_2;
        h64 ^= h64 >> 29;
        h64 *= PRIME64_3;
        h64 ^= h64 >> 32;

        return h64;
    }

    std::string uint64_to_hex(uint64_t value)
    {
        std::ostringstream oss;
        oss << std::hex << std::setfill('0') << std::setw(16) << value;
        return oss.str();
    }

} // anonymous namespace

// ============================================================================
// Hasher implementation
// ============================================================================

std::string Hasher::hash_file(const std::string &filepath, uint64_t /*file_size*/)
{
    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open())
        return "";

    // For streaming xxHash, we process in chunks and combine
    std::array<uint8_t, BUFFER_SIZE> buffer;
    uint64_t h1 = 0, h2 = 0;
    uint64_t total_read = 0;
    size_t chunk_count = 0;

    while (file.read(reinterpret_cast<char *>(buffer.data()), BUFFER_SIZE) || file.gcount() > 0)
    {
        size_t bytes_read = static_cast<size_t>(file.gcount());
        uint64_t chunk_hash = xxh64(buffer.data(), bytes_read, chunk_count);
        h1 ^= chunk_hash;
        h2 += chunk_hash;
        total_read += bytes_read;
        chunk_count++;
        if (file.eof())
            break;
    }

    // Combine hashes with total size for final hash
    uint64_t final_hash = xxh64(&h1, sizeof(h1), h2) ^ xxh64(&total_read, sizeof(total_read), 0);
    return uint64_to_hex(final_hash);
}

std::string Hasher::quick_hash(const std::string &filepath, uint64_t file_size)
{
    if (file_size == 0)
        return "empty";

    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open())
        return "";

    std::array<uint8_t, QUICK_HASH_SIZE> buffer;
    uint64_t h = 0;

    // Hash first 4KB
    file.read(reinterpret_cast<char *>(buffer.data()), QUICK_HASH_SIZE);
    size_t bytes_read = static_cast<size_t>(file.gcount());
    h = xxh64(buffer.data(), bytes_read, 0);

    // Hash last 4KB if file is larger
    if (file_size > QUICK_HASH_SIZE)
    {
        file.seekg(-static_cast<std::streamoff>(QUICK_HASH_SIZE), std::ios::end);
        file.read(reinterpret_cast<char *>(buffer.data()), QUICK_HASH_SIZE);
        bytes_read = static_cast<size_t>(file.gcount());
        h ^= xxh64(buffer.data(), bytes_read, 1);
    }

    // Mix in file size
    h ^= xxh64(&file_size, sizeof(file_size), 2);

    return uint64_to_hex(h);
}

std::string Hasher::sha256_file(const std::string &filepath)
{
    // Simplified - use xxHash as a stand-in for full verification
    // In production, link against OpenSSL for real SHA256
    return hash_file(filepath);
}
