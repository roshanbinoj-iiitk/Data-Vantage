import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
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
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

export function truncatePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path;
  const half = Math.floor((maxLength - 3) / 2);
  return `${path.slice(0, half)}...${path.slice(-half)}`;
}

export function getFileIcon(extension: string, _isDirectory: boolean): string {
  const ext = extension.toLowerCase().replace(/^\./, "");
  const icons: Record<string, string> = {
    // Images
    png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", webp: "🖼️", svg: "🖼️",
    bmp: "🖼️", ico: "🖼️",
    // Video
    mp4: "🎬", mkv: "🎬", avi: "🎬", mov: "🎬", webm: "🎬", flv: "🎬",
    // Audio
    mp3: "🎵", wav: "🎵", flac: "🎵", aac: "🎵", ogg: "🎵",
    // Documents
    pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊",
    ppt: "📊", pptx: "📊", txt: "📄", md: "📄",
    // Archives
    zip: "📦", tar: "📦", gz: "📦", rar: "📦", "7z": "📦",
    // Code
    js: "💻", ts: "💻", tsx: "💻", jsx: "💻", py: "💻", rs: "💻",
    cpp: "💻", c: "💻", h: "💻", go: "💻", java: "💻", rb: "💻",
    // Config
    json: "⚙️", yaml: "⚙️", yml: "⚙️", toml: "⚙️", xml: "⚙️",
  };
  return icons[ext] ?? "📄";
}
