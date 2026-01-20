import axios from 'axios'

const API_BASE_URL = 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface ScanTask {
  id: string
  status: 'pending' | 'scanning' | 'completed' | 'cancelled' | 'failed'
  total_bytes: number
  processed_bytes: number
  current_file: string
  percentage: number
}

export interface FileEntry {
  path: string
  size: number
  category: string
  modified?: string
  hash?: string
}

export interface ScanStatusResponse {
  status: string
  percentage: number
  current_file: string
}

export interface StartScanResponse {
  task_id: string
}

// API Functions
export const startScan = async (rootPath: string): Promise<StartScanResponse> => {
  const response = await api.post('/api/scan', null, {
    params: { root_path: rootPath }
  })
  return response.data
}

export const getScanStatus = async (taskId: string): Promise<ScanStatusResponse> => {
  const response = await api.get(`/api/scan/status/${taskId}`)
  return response.data
}

export const cancelScan = async (taskId: string): Promise<{ message: string }> => {
  const response = await api.post(`/api/scan/cancel/${taskId}`)
  return response.data
}

export const cancelAllScans = async (): Promise<{ message: string }> => {
  const response = await api.post('/api/scan/cancel-all')
  return response.data
}

export const getScanHistory = async (): Promise<ScanTask[]> => {
  const response = await api.get('/api/scan/history')
  return response.data
}

export const getFiles = async (): Promise<FileEntry[]> => {
  const response = await api.get('/api/scan/files')
  return response.data
}

export default api
