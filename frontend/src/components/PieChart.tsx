import { ResponsivePie } from "@nivo/pie";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import { type FileTypeStats } from "@/api/backend";

interface PieChartProps {
  data: FileTypeStats[];
  title?: string;
}

const COLORS = [
  "#8b5cf6",
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
  "#6b7280",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

export function PieChartCard({
  data,
  title = "Storage Distribution",
}: PieChartProps) {
  const chartData = data.slice(0, 10).map((item) => ({
    id: item.extension || "Unknown",
    label: item.extension || "Unknown",
    value: item.totalSize,
    count: item.count,
    size: item.totalSize,
  }));

  // Group remaining into "Other"
  if (data.length > 10) {
    const otherCount = data.slice(10).reduce((sum, d) => sum + d.count, 0);
    const otherSize = data.slice(10).reduce((sum, d) => sum + d.totalSize, 0);
    chartData.push({
      id: "Other",
      label: "Other",
      value: otherSize,
      count: otherCount,
      size: otherSize,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No data available
          </div>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsivePie
              data={chartData}
              margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
              innerRadius={0.45}
              padAngle={0.7}
              cornerRadius={3}
              activeOuterRadiusOffset={8}
              colors={COLORS}
              borderWidth={1}
              borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
              enableArcLabels={false}
              arcLinkLabelsSkipAngle={10}
              arcLinkLabelsThickness={2}
              arcLinkLabelsColor={{ from: "color" }}
              arcLinkLabelsTextColor={"hsl(var(--card-foreground))"}
              tooltip={({ datum }) => (
                <div
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    color: "hsl(var(--card-foreground))",
                    padding: 8,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{datum.label}</div>
                  <div style={{ fontSize: 12 }}>
                    {datum.data.count} files • {formatBytes(datum.data.size)}
                  </div>
                </div>
              )}
              /* legend removed per request */
              animate
              motionConfig="gentle"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
