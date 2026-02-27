import { useState } from "react";
import { ChevronDown, ChevronRight, FileIcon } from "lucide-react";
import { type DuplicateGroup } from "@/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  index: number;
}

export function DuplicateGroupCard({ group, index }: DuplicateGroupCardProps) {
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
            {group.files.map((file, i) => (
              <div
                key={file.id || i}
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
