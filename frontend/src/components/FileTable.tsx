import { useState } from "react";
import { useFilters } from "@/lib/filters";
import { ArrowUpDown, FolderOpen, Trash2 } from "lucide-react";
import { type FileEntry } from "@/api/backend";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, getFileIcon, cn } from "@/lib/utils";

interface FileTableProps {
  files: FileEntry[];
  onFileClick?: (file: FileEntry) => void;
  onDirectoryClick?: (file: FileEntry) => void;
  onDeleteFile?: (file: FileEntry) => void;
  showPath?: boolean;
}

type SortField = "name" | "size" | "extension" | "modifiedTime";
type SortDirection = "asc" | "desc";

export function FileTable({
  files,
  onDirectoryClick,
  onFileClick,
  onDeleteFile,
  showPath = false,
}: FileTableProps) {
  const { fileTable, setFileTable } = useFilters();
  const sortField = fileTable.sortField as SortField;
  const sortDirection = fileTable.sortDirection as SortDirection;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setFileTable({ sortDirection: sortDirection === "asc" ? "desc" : "asc" });
    } else {
      setFileTable({ sortField: field, sortDirection: "asc" });
    }
  };

  const handleRowClick = (file: FileEntry) => {
    if (file.isDirectory && onDirectoryClick) {
      onDirectoryClick(file);
    } else if (onFileClick) {
      onFileClick(file);
    }
  };

  const sortedFiles = [...files].sort((a, b) => {
    // Directories first
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }

    let aValue: string | number;
    let bValue: string | number;

    switch (sortField) {
      case "size":
        aValue = a.sizeOnDisk;
        bValue = b.sizeOnDisk;
        break;
      case "modifiedTime":
        aValue = a.modifiedTime;
        bValue = b.modifiedTime;
        break;
      case "extension":
        aValue = a.extension || "";
        bValue = b.extension || "";
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    return sortDirection === "asc"
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  });

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("name")}
                className="hover:bg-transparent"
              >
                Name
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            {showPath && <TableHead>Path</TableHead>}
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("extension")}
                className="hover:bg-transparent"
              >
                Type
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("size")}
                className="hover:bg-transparent"
              >
                Size
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("modifiedTime")}
                className="hover:bg-transparent"
              >
                Modified
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            {onDeleteFile && <TableHead className="w-12"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedFiles.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={
                  showPath
                    ? 6 + (onDeleteFile ? 1 : 0)
                    : 5 + (onDeleteFile ? 1 : 0)
                }
                className="text-center text-muted-foreground py-8"
              >
                No files found. Start a scan to populate this table.
              </TableCell>
            </TableRow>
          ) : (
            sortedFiles.map((file, index) => (
              <TableRow
                key={file.id || index}
                className={cn(
                  "group",
                  file.isDirectory ? "cursor-pointer" : "",
                )}
                onClick={() => handleRowClick(file)}
              >
                <TableCell>
                  {file.isDirectory ? (
                    <FolderOpen className="h-4 w-4 text-blue-500" />
                  ) : (
                    <span>{getFileIcon(file.extension, false)}</span>
                  )}
                </TableCell>
                <TableCell className="font-medium">
                  <div
                    className={cn(
                      "truncate max-w-md",
                      file.isDirectory ? "text-primary font-semibold" : "",
                    )}
                    title={file.name}
                  >
                    {file.name}
                  </div>
                </TableCell>
                {showPath && (
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    <div className="truncate max-w-md" title={file.path}>
                      {file.path}
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  {file.isDirectory ? (
                    <Badge variant="secondary">Folder</Badge>
                  ) : (
                    <Badge variant="outline">{file.extension || "file"}</Badge>
                  )}
                </TableCell>
                <TableCell>{formatBytes(file.sizeOnDisk)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {file.modifiedTime > 0
                    ? new Date(file.modifiedTime * 1000).toLocaleDateString()
                    : "—"}
                </TableCell>
                {onDeleteFile && (
                  <TableCell>
                    {!file.isDirectory && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFile(file);
                        }}
                        title="Delete file"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
