import { useQuery } from "@tanstack/react-query";
import { getAllScans, type ScanResult } from "@/api/backend";
import { queryKeys } from "@/lib/query-keys";

// The most recent completed scan, or null.
export function useLatestScan(): { scan: ScanResult | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.scans,
    queryFn: ({ signal }) => getAllScans(signal),
  });
  return { scan: data?.find((s) => s.status === "completed") ?? null, isLoading };
}
