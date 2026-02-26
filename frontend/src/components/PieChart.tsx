import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import { type FileTypeStats } from "@/api/backend";

interface PieChartProps {
  data: FileTypeStats[];
  title?: string;
  showBySize?: boolean;
}

const COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#e879f9",
  "#22d3ee",
  "#a3e635",
  "#fb923c",
  "#818cf8",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
];

export function PieChartCard({
  data,
  title = "File Types",
  showBySize = true,
}: PieChartProps) {
  const chartData = data.slice(0, 10).map((item) => ({
    name: item.extension,
    value: showBySize ? item.totalSize : item.count,
    count: item.count,
    size: item.totalSize,
  }));

  // Group remaining into "Other"
  if (data.length > 10) {
    const otherCount = data.slice(10).reduce((sum, d) => sum + d.count, 0);
    const otherSize = data.slice(10).reduce((sum, d) => sum + d.totalSize, 0);
    chartData.push({
      name: "Other",
      value: showBySize ? otherSize : otherCount,
      count: otherCount,
      size: otherSize,
    });
  }

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: { name: string; count: number; size: number } }>;
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-card border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-semibold">{item.name}</p>
          <p className="text-muted-foreground">{item.count} files</p>
          <p className="text-muted-foreground">{formatBytes(item.size)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPie>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs text-foreground">{value}</span>
                )}
              />
            </RechartsPie>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
