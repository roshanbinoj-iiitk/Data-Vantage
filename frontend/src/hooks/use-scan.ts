import { useState, useEffect, useCallback, useRef } from "react";
import {
  startScan,
  getScanProgress,
  stopScan,
  getAllScans,
  getScan,
  type ScanProgress,
  type ScanResult,
} from "@/api/backend";

export function useScan() {
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailuresRef = useRef(0);

  const loadScans = useCallback(async () => {
    try {
      const data = await getAllScans();
      setScans(data);
    } catch (err) {
      console.error("Failed to load scans:", err);
    }
  }, []);

  const loadScan = useCallback(async (scanId: number) => {
    try {
      const data = await getScan(scanId);
      setCurrentScan(data);
    } catch (err) {
      console.error("Failed to load scan:", err);
    }
  }, []);

  const startNewScan = useCallback(async (path: string, minSize = 0) => {
    setIsLoading(true);
    setError(null);
    setProgress(null);
    pollFailuresRef.current = 0;
    try {
      const result = await startScan(path, undefined, minSize);
      setActiveScanId(result.scanId);
      return result.scanId;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start scan";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cancelScan = useCallback(async () => {
    if (activeScanId) {
      try {
        await stopScan(activeScanId);
      } catch (err) {
        console.error("Failed to stop scan:", err);
      }
    }
  }, [activeScanId]);

  // Poll for progress when scan is active
  useEffect(() => {
    if (activeScanId === null) return;

    const poll = async () => {
      try {
        const p = await getScanProgress(activeScanId);
        pollFailuresRef.current = 0;
        setProgress(p);

        if (p.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setActiveScanId(null);
          setError("Scan failed before insights could be saved. Check the path and try a smaller folder if macOS denied access.");
          loadScans();
          return;
        }

        if (!p.isScanning) {
          // Scan completed
          if (pollRef.current) clearInterval(pollRef.current);
          setActiveScanId(null);
          loadScan(activeScanId);
          loadScans();
        }
      } catch (err) {
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= 5) {
          if (pollRef.current) clearInterval(pollRef.current);
          setActiveScanId(null);
          setError(
            err instanceof Error
              ? err.message
              : "Lost connection to the backend while scanning.",
          );
          loadScans();
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, 500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeScanId, loadScan, loadScans]);

  // Load scans on mount
  useEffect(() => {
    loadScans();
  }, [loadScans]);

  return {
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
    setCurrentScan,
  };
}
