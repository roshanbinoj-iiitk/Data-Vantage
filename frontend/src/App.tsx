import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { FolderView } from "@/pages/FolderView";
import { Duplicates } from "@/pages/Duplicates";
import { Landing } from "@/pages/Landing";
// Removed RequireLaunch wrapper so routes are directly accessible

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/" element={<Layout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="files" element={<FolderView />} />
        <Route path="files/:scanId" element={<FolderView />} />
        <Route path="duplicates" element={<Duplicates />} />
        <Route path="duplicates/:scanId" element={<Duplicates />} />
      </Route>
    </Routes>
  );
}

export default App;
