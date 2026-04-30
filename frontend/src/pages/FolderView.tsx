import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Filter } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileTable } from "@/components/FileTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { FolderSunburst } from "@/components/FolderSunburst";
import {
  getFiles,
  searchFiles,
  getScan,
  getAllScans,
  deleteFiles,
  type FileEntry,
  type ScanResult,
} from "@/api/backend";
import { useFilters } from "@/lib/filters";
import { motion } from "framer-motion";

interface BreadcrumbItem {
  id: number;
  name: string;
}

export function FolderView() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { globalSearch, isSearching, setGlobalSearch, setIsSearching } =
    useFilters();
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentParentId, setCurrentParentId] = useState(0);

  // Delete confirmation state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDesc, setConfirmDesc] = useState("");
  const [pendingAction, setPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);
  const { toast } = useToast();

  // Auto-select latest scan if none specified
  useEffect(() => {
    if (!scanId) {
      getAllScans()
        .then((scans) => {
          if (scans.length > 0) {
            navigate(`/files/${scans[0].scanId}`, { replace: true });
          } else {
            setLoading(false);
          }
        })
        .catch(() => setLoading(false));
    }
  }, [scanId, navigate]);

  const loadFiles = useCallback(
    async (parentId: number) => {
      if (!scanId) return;
      setLoading(true);
      try {
        const data = await getFiles(parseInt(scanId), parentId);
        setFiles(data);
      } catch (err) {
        console.error("Failed to load files:", err);
      } finally {
        setLoading(false);
      }
    },
    [scanId],
  );

  useEffect(() => {
    if (!scanId) return;
    const id = parseInt(scanId);
    getScan(id).then(setScan).catch(console.error);
    loadFiles(0);
  }, [scanId, loadFiles]);

  const handleDirectoryClick = (file: FileEntry) => {
    setCurrentParentId(file.id);
    setBreadcrumbs((prev) => [...prev, { id: file.id, name: file.name }]);
    loadFiles(file.id);
    setGlobalSearch("");
    setIsSearching(false);
  };

  const handleBack = () => {
    // go up one level
    if (breadcrumbs.length === 0) {
      setCurrentParentId(0);
      loadFiles(0);
      return;
    }

    const newBreadcrumbs = breadcrumbs.slice(0, -1);
    const newParentId =
      newBreadcrumbs.length === 0
        ? 0
        : newBreadcrumbs[newBreadcrumbs.length - 1].id;
    setBreadcrumbs(newBreadcrumbs);
    setCurrentParentId(newParentId);
    loadFiles(newParentId);
    setGlobalSearch("");
    setIsSearching(false);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setCurrentParentId(0);
      setBreadcrumbs([]);
      loadFiles(0);
    } else {
      const crumb = breadcrumbs[index];
      setCurrentParentId(crumb.id);
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
      loadFiles(crumb.id);
    }
    setGlobalSearch("");
    setIsSearching(false);
  };

  const handleSearch = async () => {
    if (!scanId || !globalSearch.trim()) {
      setIsSearching(false);
      loadFiles(currentParentId);
      return;
    }

    setLoading(true);
    setIsSearching(true);
    try {
      const results = await searchFiles(parseInt(scanId), globalSearch);
      setFiles(results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = useCallback(
    (file: FileEntry) => {
      setConfirmDesc(`Permanently delete this file from disk?\n\n${file.path}`);
      setPendingAction(() => async () => {
        const id = parseInt(scanId!);
        try {
          const res = await deleteFiles(id, [file.path]);
          if (res.deletedCount > 0) {
            toast("success", `Deleted ${file.name}`);
          }
          if (res.failedCount > 0) {
            toast("error", `Failed to delete ${file.name}`);
          }
          // Refresh file list
          if (isSearching && globalSearch.trim()) {
            const results = await searchFiles(id, globalSearch);
            setFiles(results);
          } else {
            await loadFiles(currentParentId);
          }
        } catch (err: unknown) {
          toast("error", err instanceof Error ? err.message : "Delete failed");
        }
      });
      setConfirmOpen(true);
    },
    [scanId, currentParentId, isSearching, globalSearch, loadFiles, toast],
  );

  const handleConfirm = useCallback(async () => {
    setConfirmOpen(false);
    if (pendingAction) {
      await pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmOpen(false);
    setPendingAction(null);
  }, []);

  if (!scanId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">File Explorer</h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Browse and search through all indexed files
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Scan Selected</CardTitle>
            <CardDescription>
              Run a scan from the Dashboard to explore files
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
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
        <h1 className="text-3xl font-bold tracking-tight">File Explorer</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          {scan ? scan.rootPath : "Browse and search through all indexed files"}
        </p>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search & Navigate
          </CardTitle>
          <CardDescription>
            Search files by name or browse the directory tree
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button variant="secondary" onClick={handleSearch}>
              Search
            </Button>
            {isSearching && (
              <Button
                variant="ghost"
                onClick={() => {
                  setGlobalSearch("");
                  setIsSearching(false);
                  loadFiles(currentParentId);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Breadcrumbs */}
      {!isSearching && (
        <nav className="flex items-center gap-1 text-sm flex-wrap">
          <button
            className="text-primary hover:underline font-medium"
            onClick={() => handleBreadcrumbClick(-1)}
          >
            Root
          </button>
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <button
                className={`hover:underline ${
                  index === breadcrumbs.length - 1
                    ? "text-foreground font-medium"
                    : "text-primary"
                }`}
                onClick={() => handleBreadcrumbClick(index)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {/* Two-column layout: Chart + File Table */}
      <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-6">
        {/* Sunburst Chart */}
        {!isSearching && (
          <Card className="lg:sticky lg:top-6 lg:self-start min-w-0">
            <CardHeader>
              <CardTitle>Storage Distribution</CardTitle>
              <CardDescription>Click on folders to navigate</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-[500px]">
                  <div className="animate-pulse-slow text-muted-foreground">
                    Loading...
                  </div>
                </div>
              ) : (
                <FolderSunburst
                  files={files}
                  onDirectoryClick={handleDirectoryClick}
                  onBack={handleBack}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* File Table */}
        <Card
          className={`${!isSearching ? "" : "lg:col-span-2"} min-w-0`}
        >
          <CardHeader>
            <CardTitle>Files ({files.length})</CardTitle>
            <CardDescription>
              {isSearching
                ? "Showing search results"
                : "All indexed files in current directory"}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-auto">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-pulse-slow text-muted-foreground">
                  Loading...
                </div>
              </div>
            ) : (
              <FileTable
                files={files}
                onDirectoryClick={handleDirectoryClick}
                onDeleteFile={handleDeleteFile}
                showPath={isSearching}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete File"
        description={confirmDesc}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />
    </motion.div>
  );
}
