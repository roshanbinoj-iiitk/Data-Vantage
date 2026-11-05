import { useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/utils";

// Provides react-query with a cache that reports failed loads as toasts
// instead of only logging them.
export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (err, query) => {
            // Progress polling reports its own errors on the dashboard.
            if (query.queryKey.includes("progress")) return;
            toast("error", `Loading failed: ${errorMessage(err)}`);
          },
        }),
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
