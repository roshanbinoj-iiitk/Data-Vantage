import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function Duplicates() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

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

  const totalDuplicates = groups.reduce((sum, g) => sum + g.fileCount - 1, 0);
  const wastedSpace = groups.reduce((sum, g) => sum + g.wastedSpace, 0);

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
            Found {total} groups of duplicate files
          </div>
          {groups.map((group, idx) => (
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
