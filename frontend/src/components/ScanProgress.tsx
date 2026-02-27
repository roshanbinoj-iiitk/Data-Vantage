import { X } from "lucide-react";
import { type ScanProgress } from "@/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatBytes,
  formatNumber,
  formatDuration,
  truncatePath,
} from "@/lib/utils";

interface ScanProgressProps {
  progress: ScanProgress;
  onCancel?: () => void;
}

export function ScanProgressCard({ progress, onCancel }: ScanProgressProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Scan Progress</CardTitle>
          <div className="flex items-center gap-2">
            {progress.isScanning ? (
              <Badge variant="default">
                {progress.status === "hashing" ? "Hashing duplicates…" : "Scanning…"}
              </Badge>
            ) : (
              <Badge variant="success">Completed</Badge>
            )}
            {progress.isScanning && onCancel && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCancel}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Progress</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {formatNumber(progress.filesScanned)} files
            </span>
          </div>
          <Progress value={progress.isScanning ? 50 : 100} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-bold">
              {formatNumber(progress.filesScanned)}
            </div>
            <div className="text-xs text-muted-foreground">Files</div>
          </div>
          <div>
            <div className="text-lg font-bold">
              {formatNumber(progress.directoriesScanned)}
            </div>
            <div className="text-xs text-muted-foreground">Directories</div>
          </div>
          <div>
            <div className="text-lg font-bold">
              {formatBytes(progress.totalSize)}
            </div>
            <div className="text-xs text-muted-foreground">Total Size</div>
          </div>
          <div>
            <div className="text-lg font-bold">
              {formatDuration(progress.elapsedSeconds)}
            </div>
            <div className="text-xs text-muted-foreground">Duration</div>
          </div>
        </div>

        {progress.duplicatesFound > 0 && (
          <div className="text-sm text-muted-foreground">
            Found{" "}
            <span className="font-semibold text-destructive">
              {progress.duplicatesFound}
            </span>{" "}
            duplicate groups
          </div>
        )}

        {progress.currentPath && progress.isScanning && (
          <div className="space-y-1.5 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current file:
            </div>
            <div className="text-xs font-mono truncate bg-primary/5 dark:bg-primary/10 text-primary p-2.5 rounded-lg border border-primary/10">
              {truncatePath(progress.currentPath, 80)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
