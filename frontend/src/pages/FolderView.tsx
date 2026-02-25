import { useState, useEffect } from 'react'
import { Search, Filter } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FileTable } from '@/components/FileTable'
import { getFiles } from '@/api/backend'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function FolderView() {
  const [files, setFiles] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      const data = await getFiles()
      setFiles(data)
    } catch (error) {
      console.error('Failed to load files:', error)
    }
  }

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.path.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || file.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const categories = ['all', ...new Set(files.map(f => f.category))]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">File Explorer</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Browse and search through all indexed files
        </p>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>
            Search and filter files by name or category
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setCategoryFilter(category)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95 shadow-sm",
                  categoryFilter === category
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                )}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* File Table */}
      <Card>
        <CardHeader>
          <CardTitle>Files ({filteredFiles.length})</CardTitle>
          <CardDescription>
            {searchQuery || categoryFilter !== 'all' 
              ? `Showing filtered results` 
              : 'All indexed files'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileTable files={filteredFiles} />
        </CardContent>
      </Card>
    </motion.div>
  )
}
