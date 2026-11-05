import type { FileEntry, FileSortField, SortOrder } from "@/api/backend";

// Client-side sort for small lists (search results). Folder listings are
// sorted by the backend.
export function sortLocally(files: FileEntry[], field: FileSortField, order: SortOrder): FileEntry[] {
  const mul = order === "asc" ? 1 : -1;
  return [...files].sort((a, b) => {
    if (field !== "size" && a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    switch (field) {
      case "size":
        return mul * (a.sizeOnDisk - b.sizeOnDisk);
      case "modified":
        return mul * (a.modifiedTime - b.modifiedTime);
      case "extension":
        return mul * a.extension.localeCompare(b.extension) || a.name.localeCompare(b.name);
      default:
        return mul * a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
  });
}
