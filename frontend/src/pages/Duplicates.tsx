import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DuplicateGroupCard } from "@/components/DuplicateGroup";
import {
  getDuplicates,
  getScan,
  type DuplicateGroup,
  type ScanResult,
} from "@/api/backend";
import { formatBytes, formatNumber } from "@/lib/utils";

export function Duplicates() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

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

  if (!scanId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No scan selected.</p>
        <Button variant="link" onClick={() => navigate("/")}>
          Go to Dashboard
        </Button>
      </div>
    );
  }

  const totalWasted = groups.reduce((sum, g) => sum + g.wastedSpace, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Duplicate Files</h1>
          {scan && (
            <p className="text-muted-foreground text-sm mt-1">
              Scan: {scan.rootPath}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate("/")}>
          ← Back
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{formatNumber(total)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Duplicate Groups
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-destructive">
              {formatBytes(totalWasted)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">Wasted Space</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">
              {scan ? formatNumber(scan.duplicateFiles) : "0"}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Total Duplicate Files
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Groups */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-pulse-slow text-muted-foreground">
            Loading duplicates...
          </div>
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="text-lg font-semibold">No Duplicates Found</h3>
            <p className="text-muted-foreground mt-1">
              Your files are all unique. Great job keeping things tidy!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
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
            ← Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <Button
            variant="outline"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
