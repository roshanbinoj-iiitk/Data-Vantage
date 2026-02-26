import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScanProgressCard } from "@/components/ScanProgress";
import { PieChartCard } from "@/components/PieChart";
import { useScan } from "@/hooks/use-scan";
import {
  getFileTypeStats,
  deleteScan,
  type FileTypeStats,
} from "@/api/backend";
import { formatBytes, formatNumber, formatDuration } from "@/lib/utils";
import { useEffect } from "react";

export function Dashboard() {
  const navigate = useNavigate();
  const {
    activeScanId,
    progress,
    scans,
    currentScan,
    isLoading,
    error,
    startNewScan,
    cancelScan,
    loadScans,
    loadScan,
  } = useScan();

  const [scanPath, setScanPath] = useState("");
  const [fileTypeStats, setFileTypeStats] = useState<FileTypeStats[]>([]);

  // Load stats for the most recent scan
  useEffect(() => {
    const latestScan = currentScan || (scans.length > 0 ? scans[0] : null);
    if (latestScan && latestScan.scanId > 0) {
      getFileTypeStats(latestScan.scanId)
        .then(setFileTypeStats)
        .catch(console.error);
    }
  }, [currentScan, scans]);

  const handleStartScan = async () => {
    if (!scanPath.trim()) return;
    const scanId = await startNewScan(scanPath.trim());
    if (scanId) {
      setScanPath("");
    }
  };

  const handleDeleteScan = async (scanId: number) => {
    await deleteScan(scanId);
    loadScans();
  };

  const latestScan = currentScan || (scans.length > 0 ? scans[0] : null);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Scan Input */}
      <Card>
        <CardHeader>
          <CardTitle>Start a New Scan</CardTitle>
          <CardDescription>
            Enter a directory path to scan for files and detect duplicates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="/home/user/Documents"
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartScan()}
              disabled={isLoading || !!activeScanId}
            />
            <Button
              onClick={handleStartScan}
              disabled={isLoading || !!activeScanId || !scanPath.trim()}
            >
              {isLoading ? "Starting..." : "Scan"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

      {/* Active Scan Progress */}
      {progress && progress.isScanning && (
        <ScanProgressCard progress={progress} onCancel={cancelScan} />
      )}

      {/* Summary Stats */}
      {latestScan && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            title="Total Files"
            value={formatNumber(latestScan.totalFiles)}
            description={`${formatNumber(latestScan.totalDirectories)} directories`}
          />
          <StatsCard
            title="Total Size"
            value={formatBytes(latestScan.totalSize)}
            description={`Scanned in ${formatDuration(latestScan.scanDuration)}`}
          />
          <StatsCard
            title="Duplicate Groups"
            value={formatNumber(latestScan.duplicateGroups)}
            description={`${formatNumber(latestScan.duplicateFiles)} duplicate files`}
            variant={latestScan.duplicateGroups > 0 ? "destructive" : "default"}
          />
          <StatsCard
            title="Wasted Space"
            value={formatBytes(latestScan.wastedSpace)}
            description="Can be reclaimed"
            variant={latestScan.wastedSpace > 0 ? "destructive" : "default"}
          />
        </div>
      )}

      {/* Charts and Recent Scans */}
      <div className="grid md:grid-cols-2 gap-6">
        {fileTypeStats.length > 0 && (
          <PieChartCard data={fileTypeStats} title="File Types by Size" />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Scans</CardTitle>
          </CardHeader>
          <CardContent>
            {scans.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No scans yet. Start your first scan above!
              </p>
            ) : (
              <div className="space-y-3">
                {scans.slice(0, 5).map((scan) => (
                  <div
                    key={scan.scanId}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        loadScan(scan.scanId);
                        navigate(`/folders/${scan.scanId}`);
                      }}
                    >
                      <div className="font-medium text-sm">{scan.rootPath}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(scan.totalFiles)} files •{" "}
                        {formatBytes(scan.totalSize)} • {scan.scanDate}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {scan.duplicateGroups > 0 && (
                        <Badge
                          variant="destructive"
                          className="cursor-pointer"
                          onClick={() => navigate(`/duplicates/${scan.scanId}`)}
                        >
                          {scan.duplicateGroups} dups
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteScan(scan.scanId)}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatsCard({
  title,
  value,
  description,
  variant = "default",
}: {
  title: string;
  value: string;
  description: string;
  variant?: "default" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <div
          className={`text-2xl font-bold mt-1 ${variant === "destructive" ? "text-destructive" : ""}`}
        >
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
