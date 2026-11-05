import { useMemo, useRef, useState } from "react";
import { ResponsivePie } from "@nivo/pie";
import { motion } from "framer-motion";
import { type FileEntry } from "@/api/backend";
import { formatBytes } from "@/lib/utils";

interface FolderSunburstProps {
  // The largest entries of the folder, biggest first.
  files: FileEntry[];
  // Total size of the folder, so the rest can be shown as "Other".
  folderSize: number;
  onDirectoryClick: (file: FileEntry) => void;
  onBack?: () => void;
}

interface ChartData {
  id: string;
  label: string;
  value: number;
  file: FileEntry | null;
  color: string;
}

const COLORS = [
  "#8b5cf6", "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#06b6d4", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#a855f7", "#22d3ee", "#fb923c",
  "#facc15", "#f43f5e", "#0ea5e9", "#eab308",
];
const OTHER_COLOR = "#9ca3af";

export function FolderSunburst({ files, folderSize, onDirectoryClick, onBack }: FolderSunburstProps) {
  // All hooks run before any early return.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOuterHover, setIsOuterHover] = useState(false);

  const chartData = useMemo<ChartData[]>(() => {
    const shown = files.filter((f) => f.sizeOnDisk > 0);
    const data: ChartData[] = shown.map((file, index) => ({
      id: `${file.id}`,
      label: file.name,
      value: file.sizeOnDisk,
      file,
      color: COLORS[index % COLORS.length],
    }));
    const shownTotal = shown.reduce((sum, f) => sum + f.sizeOnDisk, 0);
    const rest = folderSize - shownTotal;
    if (rest > folderSize * 0.001 && rest > 0) {
      data.push({ id: "other", label: "Other items", value: rest, file: null, color: OTHER_COLOR });
    }
    return data;
  }, [files, folderSize]);

  const totalSize = useMemo(() => chartData.reduce((sum, d) => sum + d.value, 0), [chartData]);

  const distanceFromCenter = (e: React.MouseEvent) => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    return { dist: Math.sqrt(dx * dx + dy * dy), radius: Math.min(rect.width, rect.height) / 2 };
  };

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px] text-muted-foreground">No data to display</div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="relative h-[500px] w-full"
      style={{ cursor: isOuterHover ? "pointer" : "default" }}
      ref={containerRef}
      onClick={(e) => {
        const d = onBack && distanceFromCenter(e);
        if (d && d.dist > d.radius * 0.95) onBack!();
      }}
      onMouseMove={(e) => {
        const d = onBack && distanceFromCenter(e);
        setIsOuterHover(!!d && d.dist > d.radius * 0.85 && d.dist < d.radius * 1.15);
      }}
      onMouseLeave={() => setIsOuterHover(false)}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {files.length === chartData.length ? `${files.length} items` : `largest ${files.length} items`}
          </div>
        </div>
      </div>

      <ResponsivePie
        data={chartData}
        margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
        innerRadius={0.5}
        padAngle={0.7}
        cornerRadius={3}
        activeOuterRadiusOffset={12}
        colors={{ datum: "data.color" }}
        borderWidth={2}
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        enableArcLinkLabels={false}
        arcLabelsSkipAngle={8}
        arcLabelsTextColor={{ from: "color", modifiers: [["darker", 2.5]] }}
        arcLabel={(d) => {
          const percent = (d.value / totalSize) * 100;
          return percent > 3 ? `${percent.toFixed(0)}%` : "";
        }}
        tooltip={({ datum }) => (
          <div
            style={{
              background: "hsl(var(--card))",
              padding: "12px 16px",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--card-foreground))",
            }}
          >
            <div className="font-semibold mb-1">{datum.data.label}</div>
            <div className="text-sm">
              <span className="text-muted-foreground">Size: </span>
              <span className="font-medium">{formatBytes(datum.value)}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Share: </span>
              <span className="font-medium">{((datum.value / totalSize) * 100).toFixed(1)}%</span>
            </div>
            {datum.data.file?.isDirectory && (
              <div className="text-xs text-primary mt-2 font-medium">↪ Click to explore folder</div>
            )}
          </div>
        )}
        onClick={(node) => {
          if (node.data.file?.isDirectory) onDirectoryClick(node.data.file);
        }}
        animate
        motionConfig="gentle"
        transitionMode="centerRadius"
      />

      {onBack && (
        <div
          className={`absolute right-4 top-4 transition-opacity duration-150 select-none pointer-events-none ${
            isOuterHover ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden
        >
          <div className="bg-[rgba(0,0,0,0.6)] text-white text-sm px-3 py-1 rounded-full flex items-center gap-2">
            <span className="text-lg">↩</span>
            <span>Back</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
