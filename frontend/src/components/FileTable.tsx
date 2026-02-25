import { useState } from 'react'
import { ArrowUpDown, FileIcon, Image, Video, FileText, Music, Archive, Code } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatFileSize, formatDate } from '@/lib/utils'
import type { FileEntry } from '@/api/backend'

interface FileTableProps {
  files: FileEntry[]
}

type SortField = 'path' | 'size' | 'category' | 'modified'
type SortDirection = 'asc' | 'desc'

const getFileIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'image':
      return <Image className="h-4 w-4 text-purple-500" />
    case 'video':
      return <Video className="h-4 w-4 text-red-500" />
    case 'document':
      return <FileText className="h-4 w-4 text-blue-500" />
    case 'audio':
      return <Music className="h-4 w-4 text-green-500" />
    case 'archive':
      return <Archive className="h-4 w-4 text-yellow-500" />
    case 'code':
      return <Code className="h-4 w-4 text-cyan-500" />
    default:
      return <FileIcon className="h-4 w-4 text-zinc-500" />
  }
}

const getCategoryColor = (category: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (category.toLowerCase()) {
    case 'image':
      return 'default'
    case 'video':
      return 'destructive'
    case 'document':
      return 'secondary'
    default:
      return 'outline'
  }
}

export function FileTable({ files }: FileTableProps) {
  const [sortField, setSortField] = useState<SortField>('path')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedFiles = [...files].sort((a, b) => {
    let aValue: string | number = a[sortField] || ''
    let bValue: string | number = b[sortField] || ''

    if (sortField === 'size') {
      aValue = a.size
      bValue = b.size
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }

    return sortDirection === 'asc' 
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number)
  })

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('path')}
                className="hover:bg-transparent"
              >
                Name
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('size')}
                className="hover:bg-transparent"
              >
                Size
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('category')}
                className="hover:bg-transparent"
              >
                Category
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort('modified')}
                className="hover:bg-transparent"
              >
                Modified
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedFiles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No files found. Start a scan to populate this table.
              </TableCell>
            </TableRow>
          ) : (
            sortedFiles.map((file, index) => (
              <TableRow key={index} className="group">
                <TableCell>{getFileIcon(file.category)}</TableCell>
                <TableCell className="font-medium">
                  <div className="truncate max-w-md" title={file.path}>
                    {file.path.split('/').pop()}
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-md">
                    {file.path}
                  </div>
                </TableCell>
                <TableCell>{formatFileSize(file.size)}</TableCell>
                <TableCell>
                  <Badge variant={getCategoryColor(file.category)}>
                    {file.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {file.modified ? formatDate(file.modified) : 'N/A'}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
