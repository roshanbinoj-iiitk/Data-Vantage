import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getScanStatus, cancelScan } from '@/api/backend'

interface ScanProgressProps {
  taskId: string
  onComplete?: () => void
  onCancel?: () => void
}

export function ScanProgress({ taskId, onComplete, onCancel }: ScanProgressProps) {
  const [status, setStatus] = useState<string>('scanning')
  const [percentage, setPercentage] = useState<number>(0)
  const [currentFile, setCurrentFile] = useState<string>('')

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getScanStatus(taskId)
        setStatus(data.status)
        setPercentage(data.percentage)
        setCurrentFile(data.current_file)

        if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'failed') {
          clearInterval(interval)
          if (data.status === 'completed' && onComplete) {
            onComplete()
          }
        }
      } catch (error) {
        console.error('Failed to fetch scan status:', error)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [taskId, onComplete])

  const handleCancel = async () => {
    try {
      await cancelScan(taskId)
      if (onCancel) onCancel()
    } catch (error) {
      console.error('Failed to cancel scan:', error)
    }
  }

  const getStatusBadge = () => {
    switch (status) {
      case 'scanning':
        return <Badge variant="default">Scanning</Badge>
      case 'completed':
        return <Badge variant="success">Completed</Badge>
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Scan Progress</CardTitle>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {status === 'scanning' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Progress</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">{percentage.toFixed(1)}%</span>
          </div>
          <Progress value={percentage} />
        </div>
        
        {currentFile && (
          <div className="space-y-1.5 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current file:</div>
            <div className="text-xs font-mono truncate bg-primary/5 dark:bg-primary/10 text-primary p-2.5 rounded-lg border border-primary/10">
              {currentFile}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
