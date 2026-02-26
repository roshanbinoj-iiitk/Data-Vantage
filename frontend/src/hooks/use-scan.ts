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

  const startNewScan = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await startScan(path);
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
        setProgress(p);

        if (!p.isScanning) {
          // Scan completed
          if (pollRef.current) clearInterval(pollRef.current);
          setActiveScanId(null);
          loadScan(activeScanId);
          loadScans();
        }
      } catch {
        // Scan might not be started yet, retry
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
