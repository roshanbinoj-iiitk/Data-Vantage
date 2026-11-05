import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface NoScanSelectedProps {
  description: string;
  icon: LucideIcon;
}

export function NoScanSelected({ description, icon: Icon }: NoScanSelectedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No Scan Selected</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center py-12">
        <div className="text-center text-muted-foreground">
          <Icon className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden />
          <p>No scan data available</p>
          <Link to="/dashboard" className="mt-2 inline-block text-primary underline-offset-4 hover:underline">
            Go to Dashboard
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
