import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  HardDrive,
  Files,
  Clock,
  Copy,
  AlertTriangle,
} from "lucide-react";
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
import { PieChartCard } from "@/components/PieChart";
import { ScanProgressCard } from "@/components/ScanProgress";
import { useScan } from "@/hooks/use-scan";
import {
  getFileTypeStats,
  deleteScan,
  type FileTypeStats,
} from "@/api/backend";
import { pickDirectory } from "@/api/backend";
import { formatBytes, formatNumber, formatDuration } from "@/lib/utils";
import { motion } from "framer-motion";

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
  const [minSize, setMinSize] = useState<number>(0);
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
    const scanId = await startNewScan(scanPath.trim(), minSize);
    if (scanId) {
      setScanPath("");
    }
  };

  const handleChooseDirectory = async () => {
    try {
      const res = await pickDirectory();
      if (res && res.path && res.path.trim()) {
        setScanPath(res.path);
        return;
      }
    } catch (err) {
      // fallthrough to prompt
    }

    const manual = window.prompt(
      "GUI picker unavailable. Paste absolute directory path:",
    );
    if (manual && manual.trim()) setScanPath(manual.trim());
  };

  const handleDeleteScan = async (scanId: number) => {
    await deleteScan(scanId);
    loadScans();
  };

  const latestScan = currentScan || (scans.length > 0 ? scans[0] : null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Monitor your storage and manage file scans
        </p>
      </div>

      {/* Scan Input */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-600" />
            Start New Scan
          </CardTitle>
          <CardDescription className="font-medium">
            Enter a directory path to scan for files and duplicates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="/path/to/directory"
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartScan()}
              disabled={isLoading || !!activeScanId}
              className="flex-1"
            />
            <Button
              onClick={handleChooseDirectory}
              disabled={isLoading || !!activeScanId}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 shadow-sm transition-all"
            >
              Choose
            </Button>
            <Button
              onClick={handleStartScan}
              disabled={isLoading || !!activeScanId || !scanPath.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95"
            >
              <Play className="h-4 w-4 mr-2" />
              {isLoading ? "Starting..." : "Start Scan"}
            </Button>
          </div>
          <div className="mt-3">
            <label className="text-sm font-medium mr-2">Exclude files smaller than:</label>
            <input
              type="range"
              min={0}
              max={10485760}
              step={1024}
              value={minSize}
              onChange={(e) => setMinSize(Number(e.target.value))}
              disabled={isLoading || !!activeScanId}
            />
            <span className="ml-3 text-sm text-muted-foreground">
              {formatBytes(minSize)}
            </span>
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
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="hover:shadow-md transition-all shadow-sm border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                Total Files
              </CardTitle>
              <Files className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {formatNumber(latestScan.totalFiles)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium italic">
                {formatNumber(latestScan.totalDirectories)} directories
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all shadow-sm border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                Total Size
              </CardTitle>
              <HardDrive className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {formatBytes(latestScan.totalSize)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium italic">
                Scanned in {formatDuration(latestScan.scanDuration)}
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all shadow-sm border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                Duplicate Groups
              </CardTitle>
              <Copy className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                {formatNumber(latestScan.duplicateGroups)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium italic">
                {formatNumber(latestScan.duplicateFiles)} duplicate files
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all shadow-sm border-l-4 border-l-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                Wasted Space
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                {formatBytes(latestScan.wastedSpace)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium italic">
                Can be reclaimed
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts and Recent Scans */}
      <div className="grid md:grid-cols-2 gap-6">
        {fileTypeStats.length > 0 && (
          <PieChartCard data={fileTypeStats} title="Storage Distribution" />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
            <CardDescription>Latest scan operations</CardDescription>
          </CardHeader>
          <CardContent>
            {scans.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No scans yet. Start your first scan above!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {scans.slice(0, 5).map((scan) => (
                  <div
                    key={scan.scanId}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-transparent hover:border-border transition-colors group"
                  >
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        loadScan(scan.scanId);
                        navigate(`/files/${scan.scanId}`);
                      }}
                    >
                      <div className="text-sm font-medium">{scan.rootPath}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(scan.totalFiles)} files &bull;{" "}
                        {formatBytes(scan.totalSize)} &bull; {scan.scanDate}
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
                        &times;
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
