import { ResponsivePie } from "@nivo/pie";
import { type FileEntry } from "@/api/backend";
import { formatBytes } from "@/lib/utils";
import { motion } from "framer-motion";
import React from "react";

interface FolderSunburstProps {
  files: FileEntry[];
  onDirectoryClick: (file: FileEntry) => void;
  onBack?: () => void;
}

interface ChartData {
  id: string;
  label: string;
  value: number;
  file: FileEntry;
  color: string;
}

const COLORS = [
  "#8b5cf6",
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
  "#a855f7",
  "#22d3ee",
  "#fb923c",
  "#facc15",
  "#f43f5e",
  "#0ea5e9",
  "#8b5cf6",
  "#eab308",
  "#06b6d4",
];

export function FolderSunburst({
  files,
  onDirectoryClick,
  onBack,
}: FolderSunburstProps) {
  // Transform files into chart data
  const chartData: ChartData[] = files
    .filter((f) => f.sizeOnDisk > 0)
    .sort((a, b) => b.sizeOnDisk - a.sizeOnDisk)
    .slice(0, 100) // Increased limit for better visualization
    .map((file, index) => ({
      id: file.name,
      label: file.name,
      value: file.sizeOnDisk,
      file,
      color: COLORS[index % COLORS.length],
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px] text-muted-foreground">
        No data to display
      </div>
    );
  }

  const totalSize = chartData.reduce((sum, item) => sum + item.value, 0);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [isOuterHover, setIsOuterHover] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!onBack) return;
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = Math.min(rect.width, rect.height) / 2;

    // Hovering near the outer ring
    setIsOuterHover(dist > radius * 0.85 && dist < radius * 1.15);
  };

  const handleMouseLeave = () => {
    setIsOuterHover(false);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (!onBack) return;
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = Math.min(rect.width, rect.height) / 2;

    // If click is outside the chart radius (near the outer area), consider it a "go back" action
    if (dist > radius * 0.95) {
      onBack();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="relative h-[500px] w-full"
      style={{ cursor: isOuterHover ? "pointer" : "default" }}
      ref={containerRef}
      onClick={handleContainerClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {chartData.length} items
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
        borderColor={{
          from: "color",
          modifiers: [["darker", 0.3]],
        }}
        enableArcLinkLabels={false}
        arcLabelsSkipAngle={8}
        arcLabelsTextColor={{
          from: "color",
          modifiers: [["darker", 2.5]],
        }}
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
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          >
            <div className="font-semibold mb-1">{datum.data.label}</div>
            <div className="text-sm">
              <span className="text-muted-foreground">Size: </span>
              <span className="font-medium">{formatBytes(datum.value)}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Share: </span>
              <span className="font-medium">
                {((datum.value / totalSize) * 100).toFixed(1)}%
              </span>
            </div>
            {datum.data.file.isDirectory && (
              <div className="text-xs text-primary mt-2 font-medium">
                ↪ Click to explore folder
              </div>
            )}
          </div>
        )}
        onClick={(node) => {
          if (node.data.file.isDirectory) {
            onDirectoryClick(node.data.file);
          }
        }}
        onMouseEnter={(_datum, event) => {
          const target = event.currentTarget as unknown as HTMLElement;
          if (target) {
            target.style.cursor = "pointer";
          }
        }}
        onMouseLeave={(_datum, event) => {
          const target = event.currentTarget as unknown as HTMLElement;
          if (target) {
            target.style.cursor = "default";
          }
        }}
        theme={{
          tooltip: {
            container: {
              background: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
            },
          },
        }}
        animate={true}
        motionConfig="gentle"
        transitionMode="centerRadius"
      />

      {/* Outer-ring back indicator */}
      {onBack && (
        <div
          className={`absolute right-4 top-4 transition-opacity duration-150 select-none pointer-events-none ${
            isOuterHover ? "opacity-100" : "opacity-0"
          }`}
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
