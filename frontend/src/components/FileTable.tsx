import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, FolderOpen, FolderSearch, Trash2 } from "lucide-react";
import { type FileEntry, type FileSortField, type SortOrder } from "@/api/backend";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, getFileIcon, cn } from "@/lib/utils";

interface FileTableProps {
  files: FileEntry[];
  sortField: FileSortField;
  sortOrder: SortOrder;
  onSort: (field: FileSortField) => void;
  onDirectoryClick?: (file: FileEntry) => void;
  onOpenFile?: (file: FileEntry) => void;
  onRevealFile?: (file: FileEntry) => void;
  onDeleteFile?: (file: FileEntry) => void;
  showPath?: boolean;
  // Called when the user scrolls near the end, to load the next page.
  onEndReached?: () => void;
  emptyMessage?: string;
}

const ROW_HEIGHT = 44;

function SortButton({
  field,
  label,
  sortField,
  sortOrder,
  onSort,
}: {
  field: FileSortField;
  label: string;
  sortField: FileSortField;
  sortOrder: SortOrder;
  onSort: (f: FileSortField) => void;
}) {
  const active = sortField === field;
  const Icon = !active ? ArrowUpDown : sortOrder === "asc" ? ArrowUp : ArrowDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSort(field)}
      className="hover:bg-transparent px-1"
      aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      <Icon className="ml-1 h-4 w-4" aria-hidden />
    </Button>
  );
}

export function FileTable({
  files,
  sortField,
  sortOrder,
  onSort,
  onDirectoryClick,
  onOpenFile,
  onRevealFile,
  onDeleteFile,
  showPath = false,
  onEndReached,
  emptyMessage = "This folder is empty.",
}: FileTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1;

  useEffect(() => {
    if (onEndReached && lastIndex >= files.length - 20 && files.length > 0) onEndReached();
  }, [lastIndex, files.length, onEndReached]);

  const grid = showPath
    ? "grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1.5fr)_6rem_6rem_6.5rem]"
    : "grid-cols-[2rem_minmax(0,1fr)_6rem_6rem_6.5rem]";

  return (
    <div className="rounded-md border border-border text-sm" role="table" aria-rowcount={files.length + 1}>
      <div role="row" className={cn("grid items-center gap-2 border-b border-border px-2 py-1 font-medium text-muted-foreground", grid)}>
        <span role="columnheader" className="sr-only">
          Icon
        </span>
        <span role="columnheader">
          <SortButton field="name" label="Name" sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
        </span>
        {showPath && <span role="columnheader">Path</span>}
        <span role="columnheader">
          <SortButton field="extension" label="Type" sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
        </span>
        <span role="columnheader">
          <SortButton field="size" label="Size" sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
        </span>
        <span role="columnheader" className="sr-only">
          Actions
        </span>
      </div>

      {files.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">{emptyMessage}</div>
      ) : (
        <div ref={scrollRef} className="max-h-[600px] overflow-auto" role="rowgroup">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((item) => {
              const file = files[item.index];
              const activate = () =>
                file.isDirectory ? onDirectoryClick?.(file) : (onRevealFile ?? onOpenFile)?.(file);
              return (
                <div
                  key={file.id}
                  role="row"
                  aria-rowindex={item.index + 2}
                  className={cn("group absolute left-0 right-0 grid items-center gap-2 px-2 border-b border-border/60 hover:bg-muted/50", grid)}
                  style={{ top: item.start, height: ROW_HEIGHT }}
                >
                  <span role="cell" aria-hidden>
                    {file.isDirectory ? <FolderOpen className="h-4 w-4 text-blue-500" /> : getFileIcon(file.extension)}
                  </span>
                  <span role="cell" className="min-w-0">
                    <button
                      type="button"
                      onClick={activate}
                      className={cn(
                        "block max-w-full truncate text-left hover:underline focus-visible:underline",
                        file.isDirectory ? "text-primary font-semibold" : "font-medium",
                      )}
                      title={file.isDirectory ? `Open ${file.path}` : `Show ${file.path} in the file manager`}
                    >
                      {file.name}
                    </button>
                  </span>
                  {showPath && (
                    <span role="cell" className="truncate text-xs text-muted-foreground font-mono" title={file.path}>
                      {file.path}
                    </span>
                  )}
                  <span role="cell">
                    {file.isDirectory ? (
                      <Badge variant="secondary">Folder</Badge>
                    ) : (
                      <Badge variant="outline" className="max-w-full truncate">
                        {file.extension || "file"}
                      </Badge>
                    )}
                  </span>
                  <span role="cell">{formatBytes(file.sizeOnDisk)}</span>
                  <span role="cell" className="flex justify-end gap-0.5">
                    {!file.isDirectory && onOpenFile && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenFile(file)} title="Open file" aria-label={`Open ${file.name}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {onRevealFile && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRevealFile(file)} title="Show in file manager" aria-label={`Show ${file.name} in the file manager`}>
                        <FolderSearch className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!file.isDirectory && onDeleteFile && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => onDeleteFile(file)}
                        title="Move to trash"
                        aria-label={`Move ${file.name} to trash`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
