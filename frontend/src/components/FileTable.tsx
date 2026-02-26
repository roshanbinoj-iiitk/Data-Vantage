import { type FileEntry } from "@/api/backend";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatBytes, getFileIcon, truncatePath } from "@/lib/utils";

interface FileTableProps {
  files: FileEntry[];
  onFileClick?: (file: FileEntry) => void;
  onDirectoryClick?: (file: FileEntry) => void;
  showPath?: boolean;
}

export function FileTable({
  files,
  onFileClick,
  onDirectoryClick,
  showPath = false,
}: FileTableProps) {
  const handleRowClick = (file: FileEntry) => {
    if (file.isDirectory && onDirectoryClick) {
      onDirectoryClick(file);
    } else if (onFileClick) {
      onFileClick(file);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50%]">Name</TableHead>
          {showPath && <TableHead>Path</TableHead>}
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead className="text-right">Modified</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={showPath ? 5 : 4}
              className="text-center text-muted-foreground py-8"
            >
              No files found
            </TableCell>
          </TableRow>
        ) : (
          files.map((file) => (
            <TableRow
              key={file.id}
              className={file.isDirectory ? "cursor-pointer" : ""}
              onClick={() => handleRowClick(file)}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span>{getFileIcon(file.extension, file.isDirectory)}</span>
                  <span
                    className={
                      file.isDirectory ? "text-primary font-semibold" : ""
                    }
                  >
                    {file.name}
                  </span>
                </div>
              </TableCell>
              {showPath && (
                <TableCell className="text-muted-foreground text-xs font-mono">
                  {truncatePath(file.path, 40)}
                </TableCell>
              )}
              <TableCell>
                {file.isDirectory ? (
                  <Badge variant="secondary">Folder</Badge>
                ) : (
                  <Badge variant="outline">{file.extension || "file"}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {file.isDirectory ? "—" : formatBytes(file.size)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground text-xs">
                {file.modifiedTime > 0
                  ? new Date(file.modifiedTime * 1000).toLocaleDateString()
                  : "—"}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
