import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, AlertTriangle, ArrowUpDown, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DuplicateGroupCard } from "@/components/DuplicateGroup";
import {
  getDuplicates,
  getScan,
  getAllScans,
  type DuplicateGroup,
  type ScanResult,
} from "@/api/backend";
import { formatBytes, formatNumber } from "@/lib/utils";
import { motion } from "framer-motion";

type SortField = "name" | "size" | "path" | "count" | "wasted";
type SortDir = "asc" | "desc";

function sortGroups(
  groups: DuplicateGroup[],
  field: SortField,
  dir: SortDir,
): DuplicateGroup[] {
  const sorted = [...groups];
  const mul = dir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (field) {
      case "name": {
        const nameA = a.files[0]?.name ?? "";
        const nameB = b.files[0]?.name ?? "";
        return mul * nameA.localeCompare(nameB);
      }
      case "size":
        return mul * (a.fileSize - b.fileSize);
      case "path": {
        const pathA = a.files[0]?.path ?? "";
        const pathB = b.files[0]?.path ?? "";
        return mul * pathA.localeCompare(pathB);
      }
      case "count":
        return mul * (a.fileCount - b.fileCount);
      case "wasted":
        return mul * (a.wastedSpace - b.wastedSpace);
      default:
        return 0;
    }
  });
  return sorted;
}

export function Duplicates() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  // Sort & filter state
  const [sortField, setSortField] = useState<SortField>("wasted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterText, setFilterText] = useState("");

  // Auto-select latest scan if none specified
  useEffect(() => {
    if (!scanId) {
      getAllScans()
        .then((scans) => {
          if (scans.length > 0) {
            navigate(`/duplicates/${scans[0].scanId}`, { replace: true });
          } else {
            setLoading(false);
          }
        })
        .catch(() => setLoading(false));
    }
  }, [scanId, navigate]);

  useEffect(() => {
    if (!scanId) return;
    const id = parseInt(scanId);

    setLoading(true);
    Promise.all([getDuplicates(id, limit, offset), getScan(id)])
      .then(([dupData, scanData]) => {
        setGroups(dupData.groups);
        setTotal(dupData.total);
        setScan(scanData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [scanId, offset]);

  // Apply filter + sort
  const displayGroups = useMemo(() => {
    let filtered = groups;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      filtered = groups.filter((g) =>
        g.files.some(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.path.toLowerCase().includes(q) ||
            f.extension.toLowerCase().includes(q),
        ),
      );
    }
    return sortGroups(filtered, sortField, sortDir);
  }, [groups, filterText, sortField, sortDir]);

  const totalDuplicates = groups.reduce((sum, g) => sum + g.fileCount - 1, 0);
  const wastedSpace = groups.reduce((sum, g) => sum + g.wastedSpace, 0);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" || field === "path" ? "asc" : "desc");
    }
  }

  const sortButtons: { field: SortField; label: string }[] = [
    { field: "name", label: "Name" },
    { field: "size", label: "Size" },
    { field: "path", label: "Path" },
    { field: "count", label: "Count" },
    { field: "wasted", label: "Wasted" },
  ];

  if (!scanId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Duplicate Files</h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Identify and manage duplicate files to free up storage
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Scan Selected</CardTitle>
            <CardDescription>
              Run a scan from the Dashboard to detect duplicate files
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Copy className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scan data available</p>
              <Button
                variant="link"
                onClick={() => navigate("/")}
                className="mt-2"
              >
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Duplicate Files</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          {scan
            ? `Scan: ${scan.rootPath}`
            : "Identify and manage duplicate files to free up storage"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:shadow-md transition-all shadow-sm border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              Duplicate Groups
            </CardTitle>
            <Copy className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {formatNumber(total)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-medium italic">
              Groups of identical files
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
              {formatBytes(wastedSpace)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-medium italic">
              Storage that can be reclaimed
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              Duplicate Files
            </CardTitle>
            <Copy className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {formatNumber(totalDuplicates)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-medium italic">
              Files that can be removed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sort & Filter toolbar */}
      {!loading && groups.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Filter input */}
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by name or path…"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              {/* Sort buttons */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" /> Sort:
                </span>
                {sortButtons.map((btn) => (
                  <Button
                    key={btn.field}
                    variant={sortField === btn.field ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => toggleSort(btn.field)}
                  >
                    {btn.label}
                    {sortField === btn.field && (
                      <span className="ml-1">
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
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
            <div className="animate-pulse-slow text-muted-foreground">
              Loading duplicates...
            </div>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Duplicates Found</CardTitle>
            <CardDescription>
              No duplicate files were detected in this scan
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Copy className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No duplicate files detected</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {filterText.trim()
              ? `Showing ${displayGroups.length} of ${total} groups`
              : `Found ${total} groups of duplicate files`}
          </div>
          {displayGroups.map((group, idx) => (
            <DuplicateGroupCard
              key={group.hash}
              group={group}
              index={offset + idx}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-4 py-4">
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            &larr; Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {offset + 1}&ndash;{Math.min(offset + limit, total)} of {total}
          </span>
          <Button
            variant="outline"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next &rarr;
          </Button>
        </div>
      )}
    </motion.div>
  );
}
