#pragma once

#include <string>

// $XDG_DATA_HOME, or ~/.local/share when unset.
std::string data_home_dir();

// $XDG_DATA_HOME/data-vantage (created if missing).
std::string app_data_dir();

// $XDG_RUNTIME_DIR/data-vantage (created with mode 0700 if missing), or the
// app data dir when XDG_RUNTIME_DIR is unset.
std::string app_runtime_dir();

// Creates `path` and any missing parents with the given mode.
bool make_dirs(const std::string &path, unsigned mode);
