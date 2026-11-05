// A scrollable list of paths, for confirmation dialogs.
export function PathList({ paths }: { paths: string[] }) {
  return (
    <ul className="mt-3 max-h-48 overflow-auto rounded border border-border bg-muted/40 p-2 font-mono text-xs text-foreground">
      {paths.map((p) => (
        <li key={p} className="break-all py-0.5">
          {p}
        </li>
      ))}
    </ul>
  );
}
