#pragma once

#include <nlohmann/json.hpp>

#include "database.h"
#include "scanner.h"

// JSON shapes returned by the HTTP API (camelCase keys, as the frontend expects).
nlohmann::json to_json(const FileEntry &f);
nlohmann::json to_json(const ScanResult &r);
nlohmann::json to_json(const ScanProgress &p, const std::string &status);
nlohmann::json to_json(const DuplicateGroup &g);
nlohmann::json to_json(const FileTypeStats &s);
