import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/lib/theme-provider'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { FolderView } from '@/pages/FolderView'
import { Duplicates } from '@/pages/Duplicates'

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="data-vantage-theme">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="files" element={<FolderView />} />
            <Route path="duplicates" element={<Duplicates />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
