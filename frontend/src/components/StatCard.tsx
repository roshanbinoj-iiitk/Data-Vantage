import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const tones = {
  blue: { border: "border-l-blue-500", icon: "text-blue-500", value: "text-blue-600 dark:text-blue-400" },
  purple: { border: "border-l-purple-500", icon: "text-purple-500", value: "text-purple-600 dark:text-purple-400" },
  orange: { border: "border-l-orange-500", icon: "text-orange-500", value: "text-orange-600 dark:text-orange-400" },
  red: { border: "border-l-red-500", icon: "text-red-500", value: "text-red-600 dark:text-red-400" },
} as const;

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  icon: LucideIcon;
  tone: keyof typeof tones;
}

export function StatCard({ title, value, caption, icon: Icon, tone }: StatCardProps) {
  const t = tones[tone];
  return (
    <Card className={cn("hover:shadow-md transition-all shadow-sm border-l-4", t.border)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", t.icon)} aria-hidden />
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-bold", t.value)}>{value}</div>
        {caption && <p className="text-xs text-muted-foreground mt-1 font-medium italic">{caption}</p>}
      </CardContent>
    </Card>
  );
}
