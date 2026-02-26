import { type DuplicateGroup } from "@/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, truncatePath } from "@/lib/utils";

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  index: number;
}

export function DuplicateGroupCard({ group, index }: DuplicateGroupCardProps) {
  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-muted-foreground">#{index + 1}</span>
            <Badge variant="destructive">{group.fileCount} copies</Badge>
          </CardTitle>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Each:{" "}
              <span className="font-semibold text-foreground">
                {formatBytes(group.fileSize)}
              </span>
            </span>
            <span className="text-destructive font-semibold">
              Wasted: {formatBytes(group.wastedSpace)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {group.files.map((file, i) => (
            <div
              key={file.id || i}
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground text-xs w-6">
                  {i + 1}.
                </span>
                <span className="font-medium truncate">{file.name}</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono flex-shrink-0 ml-4">
                {truncatePath(file.path, 50)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">{group.hash.substring(0, 16)}...</span>
          <span>
            Total space used:{" "}
            <span className="font-semibold">
              {formatBytes(group.fileSize * group.fileCount)}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
