import * as React from "react";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full",
      className,
    )}
    style={{ backgroundColor: "hsl(var(--border))" }}
    {...props}
  >
    <div
      className="h-full w-full flex-1 transition-all duration-300 ease-in-out"
      style={{
        transform: `translateX(-${100 - (value || 0)}%)`,
        backgroundColor: "hsl(var(--primary))",
      }}
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress };
