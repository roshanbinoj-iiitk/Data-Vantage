import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, AlertTriangle, ArrowUpDown, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DuplicateGroupCard } from "@/components/DuplicateGroup";
import { NoScanSelected } from "@/components/NoScanSelected";
import { PathList } from "@/components/PathList";
import { StatCard } from "@/components/StatCard";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useLatestScan } from "@/hooks/use-latest-scan";
import {
  deleteFiles,
  getDuplicates,
  getScan,
  keepDuplicate,
  type DeleteResult,
  type DuplicateGroup,
  type DuplicateSortField,
  type FileEntry,
} from "@/api/backend";
import { useFilters } from "@/lib/filters";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage, formatBytes, formatNumber } from "@/lib/utils";
import { motion } from "framer-motion";

const PAGE_SIZE = 20;

const sortButtons: { field: DuplicateSortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "size", label: "Size" },
  { field: "path", label: "Path" },
  { field: "count", label: "Count" },
  { field: "wasted", label: "Wasted" },
];

function PageHeader({ subtitle, exclusions }: { subtitle: string; exclusions?: string[] }) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Duplicate Files</h1>
      <p className="text-muted-foreground mt-1 text-lg break-all">{subtitle}</p>
      {exclusions && exclusions.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">Excluded from the scan: {exclusions.join(", ")}</p>
      )}
    </div>
  );
}

export function Duplicates() {
  const { scanId } = useParams<{ scanId: string }>();
  const { scan: latest, isLoading } = useLatestScan();

  if (!scanId) {
    if (isLoading) return null;
    if (latest) return <Navigate to={`/duplicates/${latest.scanId}`} replace />;
    return (
      <div className="space-y-6">
        <PageHeader subtitle="Identify and manage duplicate files to free up storage" />
        <NoScanSelected description="Run a scan from the Dashboard to detect duplicate files" icon={Copy} />
      </div>
    );
  }
  return <ScanDuplicates key={scanId} scanId={Number(scanId)} />;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function ScanDuplicates({ scanId }: { scanId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const { duplicates: prefs, setDuplicates } = useFilters();
  const [offset, setOffset] = useState(0);
  const filter = useDebounced(prefs.filterText.trim(), 250);

  // A new sort or filter starts from the first page.
  useEffect(() => setOffset(0), [prefs.sortField, prefs.sortDir, filter]);

  const scan = useQuery({ queryKey: queryKeys.scan(scanId), queryFn: ({ signal }) => getScan(scanId, signal) });
  const dups = useQuery({
    queryKey: queryKeys.duplicates(scanId, prefs.sortField, prefs.sortDir, filter, offset),
    queryFn: ({ signal }) =>
      getDuplicates(scanId, { sort: prefs.sortField, order: prefs.sortDir, filter, limit: PAGE_SIZE, offset }, signal),
    enabled: scan.data?.status === "completed",
    placeholderData: keepPreviousData,
  });

  const groups = dups.data?.groups ?? [];
  const total = dups.data?.total ?? 0;

  // Deleting the last group on the last page: step back a page.
  useEffect(() => {
    if (dups.data && offset > 0 && offset >= total) setOffset(Math.max(0, Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE));
  }, [dups.data, offset, total]);

  const report = (res: DeleteResult) => {
    if (res.deletedCount > 0)
      toast("success", `Moved ${res.deletedCount} file${res.deletedCount !== 1 ? "s" : ""} to the trash`);
    for (const f of res.failed) toast("error", `${f.path}: ${f.reason}`);
  };

  const afterChange = () => queryClient.invalidateQueries({ queryKey: ["scans"] });

  const handleDeleteFile = async (file: FileEntry) => {
    const ok = await confirm({
      title: "Move to Trash",
      description: (
        <>
          Move this file to the trash?
          <PathList paths={[file.path]} />
        </>
      ),
    });
    if (!ok) return;
    try {
      report(await deleteFiles(scanId, [file.id]));
    } catch (err) {
      toast("error", errorMessage(err, "Delete failed"));
    }
    afterChange();
  };

  const handleKeep = async (group: DuplicateGroup, keep: FileEntry) => {
    const others = group.files.filter((f) => f.id !== keep.id).map((f) => f.path);
    const ok = await confirm({
      title: "Keep One Copy",
      description: (
        <>
          Keep <span className="font-mono text-foreground break-all">{keep.path}</span> and move these{" "}
          {others.length} cop{others.length === 1 ? "y" : "ies"} to the trash? Each one is compared byte by byte with the
          kept file first.
          <PathList paths={others} />
        </>
      ),
    });
    if (!ok) return;
    try {
      report(await keepDuplicate(scanId, group.groupId, keep.id));
    } catch (err) {
      toast("error", errorMessage(err, "Delete failed"));
    }
    afterChange();
  };

  const toggleSort = (field: DuplicateSortField) => {
    if (prefs.sortField === field) setDuplicates({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" });
    else setDuplicates({ sortField: field, sortDir: field === "name" || field === "path" ? "asc" : "desc" });
  };

  if (scan.isError) {
    return (
      <div className="space-y-6">
        <PageHeader subtitle="Identify and manage duplicate files to free up storage" />
        <NoScanSelected description={errorMessage(scan.error, "This scan doesn't exist")} icon={Copy} />
      </div>
    );
  }
  if (scan.data && scan.data.status !== "completed") {
    return (
      <div className="space-y-6">
        <PageHeader subtitle={scan.data.rootPath} />
        <NoScanSelected description={`This scan is ${scan.data.status}; only completed scans have duplicates.`} icon={Copy} />
      </div>
    );
  }

  const s = scan.data;
  const loading = scan.isLoading || dups.isLoading;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader subtitle={s ? `Scan: ${s.rootPath}` : "Loading…"} exclusions={s?.exclusions} />

      {/* Totals for the whole scan, not just the page on screen. */}
      {s && (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Duplicate Groups" icon={Copy} tone="orange" value={formatNumber(s.duplicateGroups)} caption="Groups of identical files" />
          <StatCard title="Wasted Space" icon={AlertTriangle} tone="red" value={formatBytes(s.wastedSpace)} caption="Storage that can be reclaimed" />
          <StatCard
            title="Extra Copies"
            icon={Copy}
            tone="blue"
            value={formatNumber(s.duplicateFiles - s.duplicateGroups)}
            caption="Files that can be removed"
          />
        </div>
      )}

      {s && s.duplicateGroups > 0 && (
        <Card className="shadow-sm">
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input
                  placeholder="Filter by name or path…"
                  aria-label="Filter duplicate groups by name or path"
                  value={prefs.filterText}
                  onChange={(e) => setDuplicates({ filterText: e.target.value })}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Sort groups">
                <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" aria-hidden /> Sort:
                </span>
                {sortButtons.map((btn) => (
                  <Button
                    key={btn.field}
                    variant={prefs.sortField === btn.field ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => toggleSort(btn.field)}
                    aria-pressed={prefs.sortField === btn.field}
                  >
                    {btn.label}
                    {prefs.sortField === btn.field && <span className="ml-1">{prefs.sortDir === "asc" ? "↑" : "↓"}</span>}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="animate-pulse-slow text-muted-foreground">Loading duplicates...</div>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{filter ? "No Matching Groups" : "No Duplicates Found"}</CardTitle>
            <CardDescription>
              {filter ? "No duplicate group has a file matching the filter" : "No duplicate files were detected in this scan"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-12">
            <Copy className="h-12 w-12 opacity-50 text-muted-foreground" aria-hidden />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {filter
              ? `${formatNumber(total)} of ${formatNumber(s?.duplicateGroups ?? total)} groups match`
              : `Found ${formatNumber(total)} groups of duplicate files`}
          </div>
          {groups.map((group, idx) => (
            <DuplicateGroupCard
              key={group.groupId}
              group={group}
              index={offset + idx}
              onDeleteFile={handleDeleteFile}
              onKeep={handleKeep}
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-4 py-4">
          <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            &larr; Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {offset + 1}&ndash;{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <Button variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
            Next &rarr;
          </Button>
        </div>
      )}
      {dialog}
    </motion.div>
  );
}
