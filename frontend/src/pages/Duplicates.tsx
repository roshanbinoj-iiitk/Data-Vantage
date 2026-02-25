import { useState, useEffect } from 'react'
import { Copy, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DuplicateGroup } from '@/components/DuplicateGroup'
import { getFiles } from '@/api/backend'
import { formatFileSize } from '@/lib/utils'
import { motion } from 'framer-motion'

export function Duplicates() {
  const [duplicateGroups, setDuplicateGroups] = useState<Map<string, any[]>>(new Map())

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      const data = await getFiles()
      
      // Group files by hash to find duplicates
      const groups = new Map<string, any[]>()
      data.forEach(file => {
        if (file.hash) {
          if (!groups.has(file.hash)) {
            groups.set(file.hash, [])
          }
          groups.get(file.hash)!.push(file)
        }
      })
      
      // Filter to only keep groups with 2+ files
      const duplicates = new Map(
        Array.from(groups.entries()).filter(([_, files]) => files.length >= 2)
      )
      
      setDuplicateGroups(duplicates)
    } catch (error) {
      console.error('Failed to load files:', error)
    }
  }

  const totalDuplicates = Array.from(duplicateGroups.values()).reduce(
    (acc, group) => acc + group.length - 1,
    0
  )

  const wastedSpace = Array.from(duplicateGroups.values()).reduce(
    (acc, group) => acc + (group[0].size * (group.length - 1)),
    0
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Duplicate Files</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Identify and manage duplicate files to free up storage
        </p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-md transition-all shadow-sm border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">Duplicate Files</CardTitle>
            <Copy className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{totalDuplicates}</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium italic">
              Files that can be removed
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all shadow-sm border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">Wasted Space</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">{formatFileSize(wastedSpace)}</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium italic">
              Storage that can be reclaimed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Groups */}
      {duplicateGroups.size === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Duplicates Found</CardTitle>
            <CardDescription>
              Run a scan to detect duplicate files in your system
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Copy className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No duplicate files detected</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Found {duplicateGroups.size} groups of duplicate files
          </div>
          {Array.from(duplicateGroups.entries()).map(([hash, files]) => (
            <DuplicateGroup key={hash} hash={hash} files={files} />
          ))}
        </div>
      )}
    </motion.div>
  )
}
