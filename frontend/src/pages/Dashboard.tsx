import { useState, useEffect } from 'react'
import { Play, HardDrive, Files, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PieChart } from '@/components/PieChart'
import { ScanProgress } from '@/components/ScanProgress'
import { startScan, getScanHistory, getFiles } from '@/api/backend'
import { formatFileSize } from '@/lib/utils'
import { motion } from 'framer-motion'

export function Dashboard() {
  const [scanPath, setScanPath] = useState('')
  const [activeScanId, setActiveScanId] = useState<string | null>(null)
  const [files, setFiles] = useState<any[]>([])
  const [scanHistory, setScanHistory] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [filesData, historyData] = await Promise.all([
        getFiles(),
        getScanHistory()
      ])
      setFiles(filesData)
      setScanHistory(historyData)
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const handleStartScan = async () => {
    if (!scanPath.trim()) return
    
    try {
      const response = await startScan(scanPath)
      setActiveScanId(response.task_id)
    } catch (error) {
      console.error('Failed to start scan:', error)
    }
  }

  const handleScanComplete = () => {
    setActiveScanId(null)
    loadData()
  }

  // Calculate statistics
  const totalFiles = files.length
  const totalSize = files.reduce((acc, file) => acc + file.size, 0)
  
  // Group files by category
  const categoryData = files.reduce((acc, file) => {
    const category = file.category || 'other'
    if (!acc[category]) {
      acc[category] = 0
    }
    acc[category] += file.size
    return acc
  }, {} as Record<string, number>)

  const chartData = [
    { name: 'Images', value: categoryData.image || 0, color: '#8b5cf6' },
    { name: 'Videos', value: categoryData.video || 0, color: '#ef4444' },
    { name: 'Documents', value: categoryData.document || 0, color: '#3b82f6' },
    { name: 'Audio', value: categoryData.audio || 0, color: '#10b981' },
    { name: 'Archives', value: categoryData.archive || 0, color: '#f59e0b' },
    { name: 'Code', value: categoryData.code || 0, color: '#06b6d4' },
    { name: 'Other', value: categoryData.other || 0, color: '#6b7280' },
  ].filter(item => item.value > 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
          Monitor your storage and manage file scans
        </p>
      </div>

      {/* Start Scan Section */}
      <Card className="border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950 dark:to-zinc-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-600" />
            Start New Scan
          </CardTitle>
          <CardDescription>
            Enter a directory path to scan for files and duplicates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="/path/to/directory"
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartScan()}
              className="flex-1"
            />
            <Button onClick={handleStartScan} disabled={!scanPath.trim()}>
              <Play className="h-4 w-4 mr-2" />
              Start Scan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Scan Progress */}
      {activeScanId && (
        <ScanProgress
          taskId={activeScanId}
          onComplete={handleScanComplete}
          onCancel={() => setActiveScanId(null)}
        />
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <Files className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFiles.toLocaleString()}</div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Indexed files
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
            <HardDrive className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatFileSize(totalSize)}</div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Storage used
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Scans</CardTitle>
            <Clock className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scanHistory.length}</div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Scan operations
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Storage Distribution Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Storage Distribution</CardTitle>
            <CardDescription>
              Breakdown of files by category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PieChart data={chartData} />
          </CardContent>
        </Card>
      )}

      {/* Recent Scan History */}
      {scanHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
            <CardDescription>
              Latest scan operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scanHistory.slice(0, 5).map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between p-3 rounded-md bg-zinc-50 dark:bg-zinc-900"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">Scan #{scan.id}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {scan.percentage.toFixed(1)}% complete
                    </div>
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    {scan.status}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
