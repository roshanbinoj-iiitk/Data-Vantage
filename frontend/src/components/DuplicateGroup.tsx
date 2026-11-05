import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileIcon,
  Trash2,
  Shield,
} from "lucide-react";
import { type DuplicateGroup, type FileEntry } from "@/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  index: number;
  onDeleteFile?: (file: FileEntry) => void;
  onKeep?: (group: DuplicateGroup, keep: FileEntry) => void;
}

export function DuplicateGroupCard({
  group,
  index,
  onDeleteFile,
  onKeep,
}: DuplicateGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "Collapse group" : "Expand group"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <CardTitle className="text-base">
              #{index + 1} — {group.fileCount} Duplicate Files
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">
              {formatBytes(group.wastedSpace)} wasted
            </Badge>
            <Badge variant="secondary">
              {formatBytes(group.fileSize)} each
            </Badge>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {group.files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-3 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors border border-transparent hover:border-border"
              >
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    title={file.path}
                  >
                    {file.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {file.path}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onKeep && group.fileCount > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => onKeep(group, file)}
                      title="Keep this file, move all other copies to the trash"
                    >
                      <Shield className="h-3 w-3 mr-1" />
                      Keep
                    </Button>
                  )}
                  {onDeleteFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() => onDeleteFile(file)}
                      title="Move this file to the trash"
                      aria-label={`Move ${file.name} to trash`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <div className="text-xs text-muted-foreground font-mono truncate">
              Hash: {group.hash}
            </div>
            <div className="text-xs text-muted-foreground">
              Total space used:{" "}
              <span className="font-semibold">
                {formatBytes(group.fileSize * group.fileCount)}
              </span>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
