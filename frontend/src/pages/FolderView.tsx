import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Filter, ArrowUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileTable } from "@/components/FileTable";
import { FolderSunburst } from "@/components/FolderSunburst";
import { NoScanSelected } from "@/components/NoScanSelected";
import { PathList } from "@/components/PathList";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useLatestScan } from "@/hooks/use-latest-scan";
import {
  deleteFiles,
  getFileWithAncestors,
  getFiles,
  getScan,
  openFile,
  revealFile,
  searchFiles,
  type FileEntry,
  type FileSortField,
} from "@/api/backend";
import { useFilters } from "@/lib/filters";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage, formatBytes, formatNumber } from "@/lib/utils";
import { sortLocally } from "@/lib/sort";
import { motion } from "framer-motion";

const PAGE_SIZE = 200;

function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">File Explorer</h1>
      <p className="text-muted-foreground mt-1 text-lg break-all">{subtitle}</p>
    </div>
  );
}

export function FolderView() {
  const { scanId: scanParam } = useParams<{ scanId: string; dirId: string }>();
  const { scan: latest, isLoading } = useLatestScan();

  if (!scanParam) {
    if (isLoading) return null;
    if (latest) return <Navigate to={`/files/${latest.scanId}`} replace />;
    return (
      <div className="space-y-6">
        <PageHeader subtitle="Browse and search through all indexed files" />
        <NoScanSelected description="Run a scan from the Dashboard to explore files" icon={Filter} />
      </div>
    );
  }
  return <ScanExplorer key={scanParam} scanId={Number(scanParam)} />;
}

function ScanExplorer({ scanId }: { scanId: number }) {
  const { dirId: dirParam } = useParams<{ dirId: string }>();
  const dirId = dirParam ? Number(dirParam) : 0;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(activeQuery);
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const { fileTable, setFileTable } = useFilters();
  const isSearching = activeQuery.length > 0;

  useEffect(() => setSearchInput(activeQuery), [activeQuery]);

  const scan = useQuery({ queryKey: queryKeys.scan(scanId), queryFn: ({ signal }) => getScan(scanId, signal) });

  // Breadcrumbs come from the server, so they are right however you got here.
  const folder = useQuery({
    queryKey: queryKeys.entry(scanId, dirId),
    queryFn: ({ signal }) => getFileWithAncestors(scanId, dirId, signal),
    enabled: scan.data?.status === "completed",
  });

  // Every query function receives an AbortSignal; react-query cancels stale
  // requests and only shows the response for the current key, so a slow
  // earlier folder can never overwrite the one you opened.
  const listing = useInfiniteQuery({
    queryKey: queryKeys.files(scanId, dirId, fileTable.sortField, fileTable.sortDirection),
    queryFn: ({ pageParam, signal }) =>
      getFiles(
        scanId,
        { parentId: dirId, sort: fileTable.sortField, order: fileTable.sortDirection, limit: PAGE_SIZE, offset: pageParam },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: scan.data?.status === "completed" && !isSearching,
  });

  // The chart always shows the largest entries of the whole folder.
  const largest = useQuery({
    queryKey: queryKeys.files(scanId, dirId, "largest"),
    queryFn: ({ signal }) => getFiles(scanId, { parentId: dirId, sort: "size", order: "desc", limit: 100 }, signal),
    enabled: scan.data?.status === "completed" && !isSearching,
  });

  const search = useQuery({
    queryKey: queryKeys.search(scanId, activeQuery),
    queryFn: ({ signal }) => searchFiles(scanId, activeQuery, signal),
    enabled: scan.data?.status === "completed" && isSearching,
  });

  const files: FileEntry[] = useMemo(
    () => (isSearching ? (search.data ?? []) : (listing.data?.pages.flatMap((p) => p.items) ?? [])),
    [isSearching, search.data, listing.data],
  );
  const total = isSearching ? files.length : (listing.data?.pages[0]?.total ?? 0);
  const loading = isSearching ? search.isLoading : listing.isLoading;

  // Search results are a small set, sorted on the client.
  const sortedFiles = useMemo(
    () => (isSearching ? sortLocally(files, fileTable.sortField, fileTable.sortDirection) : files),
    [isSearching, files, fileTable.sortField, fileTable.sortDirection],
  );

  const goToFolder = useCallback(
    (id: number) => navigate(id === 0 ? `/files/${scanId}` : `/files/${scanId}/${id}`),
    [navigate, scanId],
  );

  const handleSort = (field: FileSortField) => {
    if (fileTable.sortField === field) {
      setFileTable({ sortDirection: fileTable.sortDirection === "asc" ? "desc" : "asc" });
    } else {
      setFileTable({ sortField: field, sortDirection: field === "size" || field === "modified" ? "desc" : "asc" });
    }
  };

  const runSearch = () => {
    const q = searchInput.trim();
    setSearchParams(q ? { q } : {});
  };

  const handleDeleteFile = async (file: FileEntry) => {
    const ok = await confirm({
      title: "Move to Trash",
      description: (
        <>
          Move this file to the trash? You can restore it from your file manager&apos;s Trash.
          <PathList paths={[file.path]} />
        </>
      ),
    });
    if (!ok) return;
    try {
      const res = await deleteFiles(scanId, [file.id]);
      if (res.deletedCount > 0) toast("success", `Moved ${file.name} to the trash`);
      for (const f of res.failed) toast("error", `${f.path}: ${f.reason}`);
    } catch (err) {
      toast("error", errorMessage(err, "Delete failed"));
    }
    queryClient.invalidateQueries({ queryKey: ["scans"] });
  };

  const runAction = (action: typeof openFile, what: string) => async (file: FileEntry) => {
    try {
      await action(scanId, file.id);
    } catch (err) {
      toast("error", `Couldn't ${what}: ${errorMessage(err)}`);
    }
  };

  if (scan.isError) {
    return (
      <div className="space-y-6">
        <PageHeader subtitle="Browse and search through all indexed files" />
        <NoScanSelected description={errorMessage(scan.error, "This scan doesn't exist")} icon={Filter} />
      </div>
    );
  }
  if (scan.data && scan.data.status !== "completed") {
    return (
      <div className="space-y-6">
        <PageHeader subtitle={scan.data.rootPath} />
        <NoScanSelected description={`This scan is ${scan.data.status}; only completed scans can be browsed.`} icon={Filter} />
      </div>
    );
  }

  const ancestors = folder.data?.ancestors ?? [];
  const current = folder.data?.entry;
  const crumbs = current && current.id !== 0 ? [...ancestors.slice(1), current] : [];
  const parentId = current && current.parentId >= 0 ? current.parentId : null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      <PageHeader subtitle={scan.data?.rootPath ?? "Loading…"} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" aria-hidden />
            Search & Navigate
          </CardTitle>
          <CardDescription>Search files by name or browse the folder tree</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search files..."
                aria-label="Search files by name"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
            {isSearching && (
              <Button type="button" variant="ghost" onClick={() => setSearchParams({})}>
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {!isSearching && (
        <nav className="flex items-center gap-1 text-sm flex-wrap" aria-label="Breadcrumb">
          {parentId !== null && (
            <Button variant="ghost" size="sm" className="h-7 px-2 mr-1" onClick={() => goToFolder(parentId)}>
              <ArrowUp className="h-4 w-4 mr-1" aria-hidden /> Up
            </Button>
          )}
          <button className="text-primary hover:underline font-medium" onClick={() => goToFolder(0)}>
            Root
          </button>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <span key={crumb.id} className="flex items-center gap-1">
                <span className="text-muted-foreground" aria-hidden>
                  /
                </span>
                <button
                  className={`hover:underline ${last ? "text-foreground font-medium" : "text-primary"}`}
                  onClick={() => goToFolder(crumb.id)}
                  aria-current={last ? "page" : undefined}
                >
                  {crumb.name}
                </button>
              </span>
            );
          })}
        </nav>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-6">
        {!isSearching && (
          <Card className="lg:sticky lg:top-20 lg:self-start min-w-0">
            <CardHeader>
              <CardTitle>Storage Distribution</CardTitle>
              <CardDescription>
                {current ? `${formatBytes(current.sizeOnDisk)} in this folder · ` : ""}Click a folder to open it
              </CardDescription>
            </CardHeader>
            <CardContent>
              {largest.isLoading || !current ? (
                <div className="flex items-center justify-center h-[500px]">
                  <div className="animate-pulse-slow text-muted-foreground">Loading...</div>
                </div>
              ) : (
                <FolderSunburst
                  files={largest.data?.items ?? []}
                  folderSize={current.sizeOnDisk}
                  onDirectoryClick={(f) => goToFolder(f.id)}
                  onBack={parentId !== null ? () => goToFolder(parentId) : undefined}
                />
              )}
            </CardContent>
          </Card>
        )}

        <Card className={`${isSearching ? "lg:col-span-2" : ""} min-w-0`}>
          <CardHeader>
            <CardTitle>
              {isSearching ? "Search results" : "Files"} ({formatNumber(total)})
            </CardTitle>
            <CardDescription>
              {isSearching
                ? files.length >= 100
                  ? "Showing the first 100 matches"
                  : "Showing search results"
                : files.length < total
                  ? `Showing ${formatNumber(files.length)} of ${formatNumber(total)}; scroll to load more`
                  : "Everything in this folder"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-pulse-slow text-muted-foreground">Loading...</div>
              </div>
            ) : (
              <FileTable
                files={sortedFiles}
                sortField={fileTable.sortField}
                sortOrder={fileTable.sortDirection}
                onSort={handleSort}
                onDirectoryClick={(f) => {
                  if (isSearching) setSearchParams({});
                  goToFolder(f.id);
                }}
                onOpenFile={runAction(openFile, "open the file")}
                onRevealFile={runAction(revealFile, "show the file")}
                onDeleteFile={handleDeleteFile}
                showPath={isSearching}
                emptyMessage={isSearching ? "No files match your search." : "This folder is empty."}
                onEndReached={
                  !isSearching && listing.hasNextPage && !listing.isFetchingNextPage
                    ? () => listing.fetchNextPage()
                    : undefined
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
      {dialog}
    </motion.div>
  );
}
