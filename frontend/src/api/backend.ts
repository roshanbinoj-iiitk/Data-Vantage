// Data-Vantage API client for the C++ backend.

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

declare global {
  interface Window {
    __DATA_VANTAGE_TOKEN__?: string;
  }
}

// The backend injects this token into the page it serves. In development the
// Vite proxy adds it instead (see vite.config.ts).
const TOKEN = typeof window !== "undefined" ? window.__DATA_VANTAGE_TOKEN__ : undefined;

// ---- Types ----

export interface FileEntry {
  id: number;
  parentId: number;
  path: string;
  name: string;
  extension: string;
  size: number; // apparent size in bytes
  sizeOnDisk: number; // disk usage (folders: sum of their contents)
  modifiedTime: number; // seconds since the Unix epoch
  isDirectory: boolean;
  hash: string;
}

export type ScanStatus = "running" | "completed" | "cancelled" | "failed";

export interface ScanResult {
  scanId: number;
  rootPath: string;
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  duplicateGroups: number;
  duplicateFiles: number; // all files that belong to a duplicate group
  wastedSpace: number;
  scanDate: string;
  scanDuration: number;
  status: ScanStatus;
  exclusions: string[];
  minSize: number;
}

export interface ScanProgress {
  filesScanned: number;
  directoriesScanned: number;
  totalSize: number;
  duplicatesFound: number;
  skippedFiles: number;
  isScanning: boolean;
  currentPath: string;
  elapsedSeconds: number;
  estimatedSecondsRemaining: number; // -1 if unknown
  filesPerSecond: number;
  status: "scanning" | "hashing" | "saving" | ScanStatus;
}

export interface DuplicateGroup {
  groupId: number;
  hash: string;
  fileSize: number;
  wastedSpace: number;
  fileCount: number;
  files: FileEntry[];
}

export interface Page<T> {
  total: number;
  items: T[];
}

export interface DuplicateResponse {
  total: number;
  exclusions: string[];
  groups: DuplicateGroup[];
}

export interface FileTypeStats {
  extension: string;
  count: number;
  totalSize: number;
}

export interface DeleteResult {
  deleted: string[];
  failed: { path: string; reason: string }[];
  deletedCount: number;
  failedCount: number;
  kept?: string;
}

export type SortOrder = "asc" | "desc";
export type FileSortField = "name" | "size" | "extension" | "modified";
export type DuplicateSortField = "wasted" | "size" | "count" | "name" | "path";

// ---- Fetch helper ----

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (TOKEN) headers["X-Data-Vantage-Token"] = TOKEN;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Cannot reach the Data-Vantage backend. Is it running?", 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
  }
  return response.json();
}

function post<T>(url: string, body: unknown = {}): Promise<T> {
  return apiFetch(url, { method: "POST", body: JSON.stringify(body) });
}

// ---- Scans ----

export function startScan(
  path: string,
  options: { exclusions?: string[]; minSize?: number } = {},
): Promise<{ scanId: number; status: string }> {
  const body: Record<string, unknown> = { path };
  if (options.exclusions) body.exclusions = options.exclusions;
  if (options.minSize && options.minSize > 0) body.minSize = options.minSize;
  return post("/scans", body);
}

export function getScanProgress(scanId: number, signal?: AbortSignal): Promise<ScanProgress> {
  return apiFetch(`/scans/${scanId}/progress`, { signal });
}

export function stopScan(scanId: number): Promise<{ status: string }> {
  return post(`/scans/${scanId}/stop`);
}

export function getScan(scanId: number, signal?: AbortSignal): Promise<ScanResult> {
  return apiFetch(`/scans/${scanId}`, { signal });
}

export function getAllScans(signal?: AbortSignal): Promise<ScanResult[]> {
  return apiFetch("/scans", { signal });
}

export function deleteScan(scanId: number): Promise<{ status: string }> {
  return apiFetch(`/scans/${scanId}`, { method: "DELETE" });
}

// ---- Files ----

export function getFiles(
  scanId: number,
  params: {
    parentId: number;
    sort?: FileSortField;
    order?: SortOrder;
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
): Promise<Page<FileEntry>> {
  const q = new URLSearchParams({
    parentId: String(params.parentId),
    sort: params.sort ?? "name",
    limit: String(params.limit ?? 200),
    offset: String(params.offset ?? 0),
  });
  if (params.order) q.set("order", params.order);
  return apiFetch(`/scans/${scanId}/files?${q}`, { signal });
}

export function getFileWithAncestors(
  scanId: number,
  fileId: number,
  signal?: AbortSignal,
): Promise<{ entry: FileEntry; ancestors: FileEntry[] }> {
  return apiFetch(`/scans/${scanId}/files/${fileId}`, { signal });
}

export function searchFiles(scanId: number, query: string, signal?: AbortSignal): Promise<FileEntry[]> {
  return apiFetch(`/scans/${scanId}/search?q=${encodeURIComponent(query)}`, { signal });
}

export function openFile(scanId: number, fileId: number): Promise<{ status: string }> {
  return post(`/scans/${scanId}/files/${fileId}/open`);
}

export function revealFile(scanId: number, fileId: number): Promise<{ status: string }> {
  return post(`/scans/${scanId}/files/${fileId}/reveal`);
}

// ---- Duplicates ----

export function getDuplicates(
  scanId: number,
  params: {
    sort?: DuplicateSortField;
    order?: SortOrder;
    filter?: string;
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
): Promise<DuplicateResponse> {
  const q = new URLSearchParams({
    sort: params.sort ?? "wasted",
    limit: String(params.limit ?? 20),
    offset: String(params.offset ?? 0),
  });
  if (params.order) q.set("order", params.order);
  if (params.filter) q.set("q", params.filter);
  return apiFetch(`/scans/${scanId}/duplicates?${q}`, { signal });
}

// ---- Delete (files go to the trash) ----

export function deleteFiles(scanId: number, ids: number[]): Promise<DeleteResult> {
  return post(`/scans/${scanId}/files/delete`, { ids });
}

export function keepDuplicate(scanId: number, groupId: number, keepId: number): Promise<DeleteResult> {
  return post(`/scans/${scanId}/duplicates/${groupId}/keep`, { keepId });
}

// ---- Statistics ----

export function getFileTypeStats(scanId: number, signal?: AbortSignal): Promise<FileTypeStats[]> {
  return apiFetch(`/scans/${scanId}/stats`, { signal });
}

// Asks the backend to show a native folder picker. Returns "" when none is available.
export function pickDirectory(): Promise<{ path: string }> {
  return post(`/pick-directory`);
}
