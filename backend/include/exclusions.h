#pragma once

#include <string>
#include <vector>

// Glob-style exclusion patterns, applied while walking the file system.
//
// Supported forms (matched case-insensitively):
//   name          exact file or directory name
//   *.ext         file extension
//   dir/**        a directory with this name anywhere under the root
//   **/dir/**     same as dir/**
//   **/pattern    fnmatch() against the entry name
//   other         fnmatch() against the name or the path relative to the root
class ExclusionMatcher
{
  public:
    ExclusionMatcher() = default;
    explicit ExclusionMatcher(std::vector<std::string> patterns);

    const std::vector<std::string> &patterns() const { return m_patterns; }

    // rel_path is relative to the scan root, without a leading '/'.
    bool excludes_directory(const std::string &rel_path, const std::string &name) const;
    bool excludes_file(const std::string &rel_path, const std::string &name) const;

    static const std::vector<std::string> &defaults();

  private:
    struct Pattern
    {
        enum class Kind
        {
            Name,      // exact name (file or directory)
            Extension, // *.ext
            Directory, // dir/** or **/dir/**
            Glob,      // fnmatch against name or rel path
        } kind;
        std::string text; // lower-cased
    };

    std::vector<std::string> m_patterns;
    std::vector<Pattern> m_compiled;
};

// Returns true when the first bytes of the file look binary. Opens the file,
// so callers should only use it for candidates that matter.
bool looks_binary(const std::string &filepath);
