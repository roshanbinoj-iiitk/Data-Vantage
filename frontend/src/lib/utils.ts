import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "";
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function getFileIcon(extension: string): string {
  const ext = extension.toLowerCase().replace(/^\./, "");
  const groups: [string, string[]][] = [
    ["🖼️", ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "heic"]],
    ["🎬", ["mp4", "mkv", "avi", "mov", "webm", "flv"]],
    ["🎵", ["mp3", "wav", "flac", "aac", "ogg", "opus"]],
    ["📝", ["doc", "docx", "odt"]],
    ["📊", ["xls", "xlsx", "ods", "ppt", "pptx", "odp", "csv"]],
    ["📦", ["zip", "tar", "gz", "rar", "7z", "xz", "zst"]],
    ["💻", ["js", "ts", "tsx", "jsx", "py", "rs", "cpp", "c", "h", "go", "java", "rb"]],
    ["⚙️", ["json", "yaml", "yml", "toml", "xml", "ini"]],
  ];
  for (const [icon, exts] of groups) if (exts.includes(ext)) return icon;
  return "📄";
}
