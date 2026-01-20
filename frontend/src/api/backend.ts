const API_BASE_URL = import.meta.env.VITE_API_BASE || '/api';

export interface FileData {
  id: string;
  name: string;
  path: string;
  size: number;
  modified: Date;
  hash: string;
  type: "file" | "folder";
  category?: string;
}

export interface ScanStatus {
  status: string;
  percentage: number;
  current_file: string;
}

export interface StatsData {
  totalFiles: number;
  totalSize: number;
  lastScanDate: string | null;
  fileDistribution: {
    images: number;
    documents: number;
    videos: number;
    others: number;
  };
}

export async function startScan(
  rootPath: string,
): Promise<{ task_id: string }> {
  const response = await fetch(
    `${API_BASE_URL}/scan?root_path=${encodeURIComponent(rootPath)}`,
    {
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to start scan: ${response.statusText}`);
  }
  return response.json();
}

export async function postScan(): Promise<void> {
  // For now, just call startScan with a default path
  // You may want to prompt the user for a path later
  const defaultPath = "/home";
  await startScan(defaultPath);
}

export async function getScanStatus(taskId: string): Promise<ScanStatus> {
  const response = await fetch(`${API_BASE_URL}/status/${taskId}`);
  if (!response.ok) {
    throw new Error(`Failed to get scan status: ${response.statusText}`);
  }
  return response.json();
}

export async function getFiles(path?: string): Promise<FileData[]> {
  const response = await fetch(`${API_BASE_URL}/files`);
  if (!response.ok) {
    throw new Error(`Failed to get files: ${response.statusText}`);
  }
  const files = await response.json();

  // Transform backend data to frontend format
  return files.map((file: any, index: number) => ({
    id: `${index}`,
    name: file.path.split("/").pop() || file.path,
    path: file.path,
    size: file.size,
    modified: new Date(),
    hash: "",
    type: "file" as const,
    category: file.category,
  }));
}

export async function getStats(): Promise<StatsData> {
  // Get files and compute stats from them
  try {
    const files = await fetch(`${API_BASE_URL}/files`);
    if (!files.ok) {
      throw new Error(`Failed to get files: ${files.statusText}`);
    }
    const fileData = await files.json();

    const totalFiles = fileData.length;
    const totalSize = fileData.reduce(
      (sum: number, file: any) => sum + (file.size || 0),
      0,
    );

    // Categorize files
    const distribution = {
      images: 0,
      documents: 0,
      videos: 0,
      others: 0,
    };

    fileData.forEach((file: any) => {
      if (file.category) {
        if (file.category.toLowerCase().includes("image")) {
          distribution.images++;
        } else if (file.category.toLowerCase().includes("document")) {
          distribution.documents++;
        } else if (file.category.toLowerCase().includes("video")) {
          distribution.videos++;
        } else {
          distribution.others++;
        }
      } else {
        distribution.others++;
      }
    });

    return {
      totalFiles,
      totalSize,
      lastScanDate: new Date().toISOString(),
      fileDistribution: distribution,
    };
  } catch (error) {
    // Return empty stats if backend is not available
    return {
      totalFiles: 0,
      totalSize: 0,
      lastScanDate: null,
      fileDistribution: {
        images: 0,
        documents: 0,
        videos: 0,
        others: 0,
      },
    };
  }
}
