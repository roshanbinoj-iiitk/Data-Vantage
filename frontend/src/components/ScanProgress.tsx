import { type ScanProgress } from "@/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
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
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {progress.isScanning && (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
            )}
            {progress.isScanning ? "Scanning..." : "Scan Complete"}
          </CardTitle>
          {progress.isScanning && onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress.isScanning && (
          <div>
            <Progress
              value={progress.filesScanned}
              max={Math.max(progress.filesScanned, 1)}
            />
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              {truncatePath(progress.currentPath)}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatItem label="Files" value={formatNumber(progress.filesScanned)} />
          <StatItem
            label="Directories"
            value={formatNumber(progress.directoriesScanned)}
          />
          <StatItem
            label="Total Size"
            value={formatBytes(progress.totalSize)}
          />
          <StatItem
            label="Duration"
            value={formatDuration(progress.elapsedSeconds)}
          />
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
      </CardContent>
    </Card>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
