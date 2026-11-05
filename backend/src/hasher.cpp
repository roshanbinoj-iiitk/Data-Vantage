#include "hasher.h"

#define XXH_INLINE_ALL
#include "xxhash.h"

#include <cstdio>
#include <cstring>
#include <memory>
#include <vector>

namespace
{
    struct FileCloser
    {
        void operator()(FILE *f) const { std::fclose(f); }
    };
    using FilePtr = std::unique_ptr<FILE, FileCloser>;

    FilePtr open_file(const std::string &path)
    {
        return FilePtr(std::fopen(path.c_str(), "rb"));
    }

    std::string to_hex(const XXH128_hash_t &h)
    {
        XXH128_canonical_t canon;
        XXH128_canonicalFromHash(&canon, h);
        static const char digits[] = "0123456789abcdef";
        std::string out;
        out.reserve(32);
        for (unsigned char byte : canon.digest)
        {
            out += digits[byte >> 4];
            out += digits[byte & 0xF];
        }
        return out;
    }

    struct StateDeleter
    {
        void operator()(XXH3_state_t *s) const { XXH3_freeState(s); }
    };
} // namespace

std::string Hasher::hash_file(const std::string &filepath)
{
    FilePtr file = open_file(filepath);
    if (!file)
        return "";

    std::unique_ptr<XXH3_state_t, StateDeleter> state(XXH3_createState());
    if (!state || XXH3_128bits_reset(state.get()) == XXH_ERROR)
        return "";

    std::vector<char> buffer(BUFFER_SIZE);
    size_t n;
    while ((n = std::fread(buffer.data(), 1, buffer.size(), file.get())) > 0)
    {
        if (XXH3_128bits_update(state.get(), buffer.data(), n) == XXH_ERROR)
            return "";
    }
    if (std::ferror(file.get()))
        return "";
    return to_hex(XXH3_128bits_digest(state.get()));
}

std::string Hasher::quick_hash(const std::string &filepath, uint64_t file_size)
{
    if (file_size == 0)
        return "empty";

    FilePtr file = open_file(filepath);
    if (!file)
        return "";

    std::unique_ptr<XXH3_state_t, StateDeleter> state(XXH3_createState());
    if (!state || XXH3_128bits_reset(state.get()) == XXH_ERROR)
        return "";

    char buffer[QUICK_HASH_SIZE];
    size_t n = std::fread(buffer, 1, sizeof(buffer), file.get());
    XXH3_128bits_update(state.get(), buffer, n);

    if (file_size > QUICK_HASH_SIZE)
    {
        if (std::fseek(file.get(), -static_cast<long>(QUICK_HASH_SIZE), SEEK_END) == 0)
        {
            n = std::fread(buffer, 1, sizeof(buffer), file.get());
            XXH3_128bits_update(state.get(), buffer, n);
        }
    }
    XXH3_128bits_update(state.get(), &file_size, sizeof(file_size));
    return to_hex(XXH3_128bits_digest(state.get()));
}

bool Hasher::files_identical(const std::string &a, const std::string &b)
{
    FilePtr fa = open_file(a);
    FilePtr fb = open_file(b);
    if (!fa || !fb)
        return false;

    std::vector<char> ba(BUFFER_SIZE), bb(BUFFER_SIZE);
    while (true)
    {
        const size_t na = std::fread(ba.data(), 1, ba.size(), fa.get());
        const size_t nb = std::fread(bb.data(), 1, bb.size(), fb.get());
        if (na != nb || std::memcmp(ba.data(), bb.data(), na) != 0)
            return false;
        if (na == 0)
            return !std::ferror(fa.get()) && !std::ferror(fb.get());
    }
}
