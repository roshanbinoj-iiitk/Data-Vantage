// Data-Vantage API Client
// Communicates with the C++ backend REST API

const API_BASE = "/api";

// ---- Types ----

export interface FileEntry {
  id: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedTime: number;
  isDirectory: boolean;
  hash: string;
  parentId: number;
}

export interface ScanResult {
  scanId: number;
  rootPath: string;
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  duplicateGroups: number;
  duplicateFiles: number;
  wastedSpace: number;
  scanDate: string;
  scanDuration: number;
}

export interface ScanProgress {
  filesScanned: number;
  directoriesScanned: number;
  totalSize: number;
  duplicatesFound: number;
  isScanning: boolean;
  currentPath: string;
  elapsedSeconds: number;
}

export interface DuplicateGroup {
  hash: string;
  fileSize: number;
  wastedSpace: number;
  fileCount: number;
  files: FileEntry[];
}

export interface DuplicateResponse {
  total: number;
  groups: DuplicateGroup[];
}

export interface FileTypeStats {
  extension: string;
  count: number;
  totalSize: number;
}

// ---- API Functions ----

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Health check
export async function checkHealth(): Promise<{
  status: string;
  service: string;
}> {
  return apiFetch("/health");
}

// ---- Scan Operations ----

export async function startScan(
  path: string,
): Promise<{ scanId: number; status: string }> {
  return apiFetch("/scans", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export async function getScanProgress(scanId: number): Promise<ScanProgress> {
  return apiFetch(`/scans/${scanId}/progress`);
}

export async function stopScan(scanId: number): Promise<{ status: string }> {
  return apiFetch(`/scans/${scanId}/stop`, { method: "POST" });
}

export async function getScan(scanId: number): Promise<ScanResult> {
  return apiFetch(`/scans/${scanId}`);
}

export async function getAllScans(): Promise<ScanResult[]> {
  return apiFetch("/scans");
}

export async function deleteScan(scanId: number): Promise<{ status: string }> {
  return apiFetch(`/scans/${scanId}`, { method: "DELETE" });
}

// ---- File Operations ----

export async function getFiles(
  scanId: number,
  parentId?: number,
  limit = 100,
  offset = 0,
): Promise<FileEntry[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (parentId !== undefined && parentId >= 0) {
    params.set("parentId", String(parentId));
  }
  return apiFetch(`/scans/${scanId}/files?${params}`);
}

export async function searchFiles(
  scanId: number,
  query: string,
): Promise<FileEntry[]> {
  return apiFetch(`/scans/${scanId}/search?q=${encodeURIComponent(query)}`);
}

// ---- Duplicate Operations ----

export async function getDuplicates(
  scanId: number,
  limit = 50,
  offset = 0,
): Promise<DuplicateResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return apiFetch(`/scans/${scanId}/duplicates?${params}`);
}

// ---- Statistics ----

export async function getFileTypeStats(
  scanId: number,
): Promise<FileTypeStats[]> {
  return apiFetch(`/scans/${scanId}/stats`);
}
