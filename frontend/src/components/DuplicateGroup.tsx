import { useState } from 'react'
import { ChevronDown, ChevronRight, FileIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatFileSize } from '@/lib/utils'

interface DuplicateFile {
  path: string
  size: number
}

interface DuplicateGroupProps {
  hash: string
  files: DuplicateFile[]
}

export function DuplicateGroup({ hash, files }: DuplicateGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (files.length < 2) return null

  const totalSize = files[0].size
  const wastedSpace = totalSize * (files.length - 1)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <CardTitle className="text-base">
              {files.length} Duplicate Files
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">
              {formatFileSize(wastedSpace)} wasted
            </Badge>
            <Badge variant="secondary">
              {formatFileSize(totalSize)} each
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors border border-transparent hover:border-border"
              >
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" title={file.path}>
                    {file.path.split('/').pop()}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {file.path}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground font-mono truncate">
              Hash: {hash}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
