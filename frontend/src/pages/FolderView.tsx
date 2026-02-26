import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileTable } from "@/components/FileTable";
import {
  getFiles,
  searchFiles,
  getScan,
  type FileEntry,
  type ScanResult,
} from "@/api/backend";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentParentId, setCurrentParentId] = useState(0);

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
    setSearchQuery("");
    setIsSearching(false);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Root
      setCurrentParentId(0);
      setBreadcrumbs([]);
      loadFiles(0);
    } else {
      const crumb = breadcrumbs[index];
      setCurrentParentId(crumb.id);
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
      loadFiles(crumb.id);
    }
    setSearchQuery("");
    setIsSearching(false);
  };

  const handleSearch = async () => {
    if (!scanId || !searchQuery.trim()) {
      setIsSearching(false);
      loadFiles(currentParentId);
      return;
    }

    setLoading(true);
    setIsSearching(true);
    try {
      const results = await searchFiles(parseInt(scanId), searchQuery);
      setFiles(results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">File Browser</h1>
          {scan && (
            <p className="text-muted-foreground text-sm mt-1">
              {scan.rootPath}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate("/")}>
          ← Back
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button variant="secondary" onClick={handleSearch}>
          Search
        </Button>
        {isSearching && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchQuery("");
              setIsSearching(false);
              loadFiles(currentParentId);
            }}
          >
            Clear
          </Button>
        )}
      </div>

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

      {/* File Table */}
      <Card>
        <CardContent className="p-0">
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
              showPath={isSearching}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
