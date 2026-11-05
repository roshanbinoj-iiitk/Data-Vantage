import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, HardDrive, Files, Clock, Copy, AlertTriangle, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PieChartCard } from "@/components/PieChart";
import { ScanProgressCard } from "@/components/ScanProgress";
import { StatCard } from "@/components/StatCard";
import { useToast } from "@/components/Toast";
import { useScan } from "@/hooks/use-scan";
import { useLatestScan } from "@/hooks/use-latest-scan";
import { useConfirm } from "@/hooks/use-confirm";
import { deleteScan, getAllScans, getFileTypeStats, pickDirectory } from "@/api/backend";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage, formatBytes, formatNumber, formatDuration } from "@/lib/utils";
import { motion } from "framer-motion";

// Preset steps: small sizes are as easy to pick as large ones.
const MIN_SIZE_STEPS = [0, 1, 4, 16, 64, 256, 1024, 4096, 10240, 102400, 1048576].map((kb) => kb * 1024);

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const { activeScanId, progress, isStarting, error, startNewScan, cancelScan } = useScan();
  const { scan: latestScan } = useLatestScan();

  const [scanPath, setScanPath] = useState("");
  const [minSizeStep, setMinSizeStep] = useState(0);
  const [pickerHint, setPickerHint] = useState<string | null>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const minSize = MIN_SIZE_STEPS[minSizeStep];
  const busy = isStarting || activeScanId !== null;

  const scans = useQuery({ queryKey: queryKeys.scans, queryFn: ({ signal }) => getAllScans(signal) });
  const stats = useQuery({
    queryKey: queryKeys.stats(latestScan?.scanId ?? -1),
    queryFn: ({ signal }) => getFileTypeStats(latestScan!.scanId, signal),
    enabled: !!latestScan,
  });

  const removeScan = useMutation({
    mutationFn: deleteScan,
    onSuccess: () => {
      toast("success", "Scan removed");
      queryClient.invalidateQueries({ queryKey: queryKeys.scans });
    },
    onError: (err) => toast("error", errorMessage(err, "Couldn't remove the scan")),
  });

  const handleStartScan = async () => {
    if (!scanPath.trim()) return;
    if (await startNewScan(scanPath.trim(), minSize)) setScanPath("");
  };

  const handleChooseDirectory = async () => {
    setPickerHint(null);
    try {
      const res = await pickDirectory();
      if (res.path.trim()) {
        setScanPath(res.path);
        return;
      }
      setPickerHint("No folder was chosen. If no picker opened, install zenity or kdialog, or type the path.");
    } catch (err) {
      setPickerHint(`${errorMessage(err)} Type the folder path instead.`);
    }
    pathInputRef.current?.focus();
  };

  const handleDeleteScan = async (scanId: number, rootPath: string) => {
    const ok = await confirm({
      title: "Remove Scan",
      description: `Remove the saved results for ${rootPath}?\n\nOnly the scan record is removed; no files on disk are touched.`,
      confirmLabel: "Remove",
    });
    if (ok) removeScan.mutate(scanId);
  };

  const allScans = scans.data ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-lg">Monitor your storage and manage file scans</p>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-600" aria-hidden />
            Start New Scan
          </CardTitle>
          <CardDescription className="font-medium">Enter a folder to scan for files and duplicates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              ref={pathInputRef}
              placeholder="/path/to/folder"
              aria-label="Folder to scan"
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartScan()}
              disabled={busy}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleChooseDirectory} disabled={busy}>
                Choose…
              </Button>
              <Button
                onClick={handleStartScan}
                disabled={busy || !scanPath.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95"
              >
                <Play className="h-4 w-4 mr-2" aria-hidden />
                {isStarting ? "Starting..." : "Start Scan"}
              </Button>
            </div>
          </div>
          {pickerHint && <p className="text-sm text-muted-foreground mt-2">{pickerHint}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label htmlFor="min-size" className="text-sm font-medium">
              Skip files smaller than:
            </label>
            <input
              id="min-size"
              type="range"
              min={0}
              max={MIN_SIZE_STEPS.length - 1}
              step={1}
              value={minSizeStep}
              onChange={(e) => setMinSizeStep(Number(e.target.value))}
              disabled={busy}
              aria-valuetext={minSize === 0 ? "No limit" : formatBytes(minSize)}
              className="w-48"
            />
            <span className="text-sm text-muted-foreground w-20">{minSize === 0 ? "No limit" : formatBytes(minSize)}</span>
          </div>
          {error && (
            <p className="text-sm text-destructive mt-2" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {progress && progress.isScanning && <ScanProgressCard progress={progress} onCancel={cancelScan} />}

      {latestScan && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <StatCard
            title="Total Files"
            icon={Files}
            tone="blue"
            value={formatNumber(latestScan.totalFiles)}
            caption={`${formatNumber(latestScan.totalDirectories)} folders`}
          />
          <StatCard
            title="Total Size"
            icon={HardDrive}
            tone="purple"
            value={formatBytes(latestScan.totalSize)}
            caption={`Scanned in ${formatDuration(latestScan.scanDuration)}`}
          />
          <StatCard
            title="Duplicate Groups"
            icon={Copy}
            tone="orange"
            value={formatNumber(latestScan.duplicateGroups)}
            caption={`${formatNumber(latestScan.duplicateFiles - latestScan.duplicateGroups)} extra copies`}
          />
          <StatCard
            title="Wasted Space"
            icon={AlertTriangle}
            tone="red"
            value={formatBytes(latestScan.wastedSpace)}
            caption="Can be reclaimed"
          />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {stats.data && stats.data.length > 0 && <PieChartCard data={stats.data} title="Storage Distribution" />}

        <Card>
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
            <CardDescription>Latest scan operations</CardDescription>
          </CardHeader>
          <CardContent>
            {allScans.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden />
                <p>No scans yet. Start your first scan above!</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {allScans.slice(0, 5).map((scan) => {
                  const completed = scan.status === "completed";
                  const details = (
                    <>
                      <span className="block text-sm font-medium break-all">{scan.rootPath}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatNumber(scan.totalFiles)} files &bull; {formatBytes(scan.totalSize)} &bull; {scan.scanDate}
                      </span>
                    </>
                  );
                  return (
                    <li
                      key={scan.scanId}
                      className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50 border border-transparent hover:border-border transition-colors"
                    >
                      {completed ? (
                        <button
                          type="button"
                          className="flex-1 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => navigate(`/files/${scan.scanId}`)}
                        >
                          {details}
                        </button>
                      ) : (
                        <div className="flex-1 min-w-0">{details}</div>
                      )}
                      <div className="flex items-center gap-2 shrink-0">
                        {!completed && <Badge variant="secondary">{scan.status}</Badge>}
                        {completed && scan.duplicateGroups > 0 && (
                          <Link
                            to={`/duplicates/${scan.scanId}`}
                            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Badge variant="destructive">{scan.duplicateGroups} dups</Badge>
                          </Link>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteScan(scan.scanId, scan.rootPath)}
                          disabled={scan.scanId === activeScanId || removeScan.isPending}
                          aria-label={`Remove scan of ${scan.rootPath}`}
                          title="Remove scan"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {dialog}
    </motion.div>
  );
}
