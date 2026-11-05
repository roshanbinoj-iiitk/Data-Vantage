export const queryKeys = {
  scans: ["scans"] as const,
  scan: (id: number) => ["scans", id] as const,
  progress: (id: number) => ["scans", id, "progress"] as const,
  stats: (id: number) => ["scans", id, "stats"] as const,
  files: (id: number, ...rest: unknown[]) => ["scans", id, "files", ...rest] as const,
  entry: (id: number, fileId: number) => ["scans", id, "entry", fileId] as const,
  search: (id: number, q: string) => ["scans", id, "search", q] as const,
  duplicates: (id: number, ...rest: unknown[]) => ["scans", id, "duplicates", ...rest] as const,
};
