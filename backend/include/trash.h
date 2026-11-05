#pragma once

#include <string>

// Moves a file to the freedesktop.org trash (the "Trash" folder file managers
// show), so a delete can be undone. Never deletes permanently.
//
// Files on the home partition go to $XDG_DATA_HOME/Trash. Files on another
// partition go to $topdir/.Trash-$uid, as the spec requires. If neither works
// the call fails and the file is left where it is.
//
// Returns true on success; on failure `error` describes the problem.
bool move_to_trash(const std::string &path, std::string &error);

// Percent-encodes a path for the Path= key of a .trashinfo file.
std::string trash_encode_path(const std::string &path);
