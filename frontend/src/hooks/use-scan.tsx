import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAllScans,
  getScanProgress,
  startScan,
  stopScan,
  type ScanProgress,
  type ScanResult,
  type ScanStatus,
} from "@/api/backend";
import { queryKeys } from "@/lib/query-keys";

interface ScanContextValue {
  activeScanId: number | null;
  progress: ScanProgress | null;
  error: string | null;
  isStarting: boolean;
  startNewScan: (path: string, minSize?: number) => Promise<number | null>;
  cancelScan: () => Promise<void>;
}

const ScanContext = createContext<ScanContextValue | undefined>(undefined);

// Tracks the running scan for the whole app, so its progress survives
// navigating between pages, and picks up a scan that's already running when
// the app loads.
export function ScanProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Scans we've stopped tracking. The cached scan list can still say
  // "running" for a moment after a scan ends; without this the resume effect
  // below would pick the scan up again, and loop.
  const doneIds = useRef(new Set<number>());

  const scans = useQuery({ queryKey: queryKeys.scans, queryFn: ({ signal }) => getAllScans(signal) });

  // Resume a scan that is still running (e.g. after a reload).
  useEffect(() => {
    if (activeScanId !== null || !scans.data) return;
    const running = scans.data.find((s) => s.status === "running" && !doneIds.current.has(s.scanId));
    if (running) setActiveScanId(running.scanId);
  }, [scans.data, activeScanId]);

  // react-query never starts a refetch while the previous one is in flight.
  const progressQuery = useQuery({
    queryKey: activeScanId === null ? ["progress", "none"] : queryKeys.progress(activeScanId),
    queryFn: ({ signal }) => getScanProgress(activeScanId!, signal),
    enabled: activeScanId !== null,
    refetchInterval: (query) => (query.state.data && !query.state.data.isScanning ? false : 500),
    retry: 4,
  });

  const progress = progressQuery.data ?? null;

  useEffect(() => {
    if (activeScanId === null) return;
    const finish = (status?: ScanStatus) => {
      doneIds.current.add(activeScanId);
      setActiveScanId(null);
      // Show the final status right away instead of the stale "running" row,
      // then refresh everything that depends on scans once.
      if (status) {
        queryClient.setQueryData<ScanResult[]>(queryKeys.scans, (old) =>
          old?.map((s) => (s.scanId === activeScanId ? { ...s, status } : s)),
        );
      }
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    };

    if (progressQuery.isError) {
      setError(progressQuery.error.message || "Lost connection to the backend while scanning.");
      finish();
      return;
    }
    if (progress && !progress.isScanning) {
      if (progress.status === "failed") {
        setError("The scan failed. Check that the folder is readable and try again.");
      }
      const final = progress.status;
      finish(final === "completed" || final === "cancelled" || final === "failed" ? final : undefined);
    }
  }, [progress, progressQuery.isError, progressQuery.error, activeScanId, queryClient]);

  const startMutation = useMutation({
    mutationFn: ({ path, minSize }: { path: string; minSize: number }) => startScan(path, { minSize }),
  });

  const startNewScan = useCallback(
    async (path: string, minSize = 0) => {
      setError(null);
      try {
        const result = await startMutation.mutateAsync({ path, minSize });
        queryClient.removeQueries({ queryKey: queryKeys.progress(result.scanId) });
        setActiveScanId(result.scanId);
        queryClient.invalidateQueries({ queryKey: queryKeys.scans });
        return result.scanId;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start scan");
        return null;
      }
    },
    [startMutation, queryClient],
  );

  const cancelScan = useCallback(async () => {
    if (activeScanId === null) return;
    try {
      await stopScan(activeScanId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop the scan");
    }
  }, [activeScanId]);

  const value = useMemo(
    () => ({
      activeScanId,
      progress: activeScanId !== null ? progress : null,
      error,
      isStarting: startMutation.isPending,
      startNewScan,
      cancelScan,
    }),
    [activeScanId, progress, error, startMutation.isPending, startNewScan, cancelScan],
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used within ScanProvider");
  return ctx;
}
