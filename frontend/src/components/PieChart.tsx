import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
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
    name: item.extension || "Unknown",
    value: item.totalSize,
    count: item.count,
    size: item.totalSize,
  }));

  // Group remaining into "Other"
  if (data.length > 10) {
    const otherCount = data.slice(10).reduce((sum, d) => sum + d.count, 0);
    const otherSize = data.slice(10).reduce((sum, d) => sum + d.totalSize, 0);
    chartData.push({
      name: "Other",
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
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPie>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${((percent || 0) * 100).toFixed(0)}%`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                animationBegin={0}
                animationDuration={800}
              >
                {chartData.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--card-foreground))",
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(_value: any, _name: any, entry: any) => [
                  `${entry.payload.count} files, ${formatBytes(entry.payload.size)}`,
                ]}
              />
              <Legend />
            </RechartsPie>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
