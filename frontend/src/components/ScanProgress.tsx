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

function statusLabel(progress: ScanProgress): string {
  if (!progress.isScanning) return "Completed";
  if (progress.status === "hashing") return "Hashing duplicates…";
  return "Scanning…";
}

function statusVariant(
  progress: ScanProgress,
): "default" | "success" | "secondary" {
  if (!progress.isScanning) return "success";
  if (progress.status === "hashing") return "secondary";
  return "default";
}

/** Compute a synthetic 0-100 progress value used by the bar. */
function computeProgressValue(progress: ScanProgress): number {
  if (!progress.isScanning) return 100;
  if (progress.status === "hashing") {
    const eta = progress.estimatedSecondsRemaining;
    if (eta > 0 && progress.elapsedSeconds > 0) {
      // During hashing we can estimate actual completion %
      // Use a capped value so the bar never appears to go backward
      const pct = Math.min(
        95,
        Math.max(
          5,
          ((progress.elapsedSeconds - eta) / progress.elapsedSeconds) * 100,
        ),
      );
      return pct;
    }
    return 60; // indeterminate hashing
  }
  // During scanning, use a logarithmic scale so the bar keeps growing
  // without ever reaching 100%
  const files = progress.filesScanned;
  if (files <= 0) return 2;
  // log10(files)/log10(target) capped at 50 — gives smooth growth
  const pct = Math.min(50, (Math.log10(files + 1) / Math.log10(100000)) * 50);
  return Math.max(2, pct);
}

export function ScanProgressCard({ progress, onCancel }: ScanProgressProps) {
  const pct = computeProgressValue(progress);
  const eta = progress.estimatedSecondsRemaining;
  const fps = progress.filesPerSecond;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Scan Progress</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant(progress)}>
              {statusLabel(progress)}
            </Badge>
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
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Progress</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {formatNumber(progress.filesScanned)} files
            </span>
          </div>
          <Progress value={pct} />
        </div>

        {/* Stat cards */}
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

        {/* Rate & ETA row */}
        {progress.isScanning && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>
              {fps > 0 && (
                <span>
                  <span className="font-semibold text-foreground">
                    {formatNumber(Math.round(fps))}
                  </span>{" "}
                  files/sec
                </span>
              )}
            </div>
            <div>
              {eta > 0 ? (
                <span>
                  ETA:{" "}
                  <span className="font-semibold text-foreground">
                    {formatDuration(eta)}
                  </span>
                </span>
              ) : progress.status === "scanning" ? (
                <span className="italic">Estimating…</span>
              ) : null}
            </div>
          </div>
        )}

        {/* Skipped files */}
        {progress.skippedFiles > 0 && (
          <div className="text-sm text-yellow-600 dark:text-yellow-400">
            {formatNumber(progress.skippedFiles)} files skipped (symlinks, hard
            links, or permission errors)
          </div>
        )}

        {/* Duplicates found */}
        {progress.duplicatesFound > 0 && (
          <div className="text-sm text-muted-foreground">
            Found{" "}
            <span className="font-semibold text-destructive">
              {progress.duplicatesFound}
            </span>{" "}
            duplicate groups
          </div>
        )}

        {/* Current path */}
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
