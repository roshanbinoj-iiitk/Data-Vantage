import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  showLabel?: boolean;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, showLabel = false, ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div className={cn("relative", className)} {...props}>
        <div
          ref={ref}
          className="relative h-4 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full bg-primary transition-all duration-300 ease-in-out rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {showLabel && (
          <span className="mt-1 text-xs text-muted-foreground">
            {percentage.toFixed(0)}%
          </span>
        )}
      </div>
    );
  },
);

Progress.displayName = "Progress";

export { Progress };
