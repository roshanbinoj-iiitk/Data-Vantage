import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Landing } from "@/pages/Landing";

// Pages load on demand so the first screen doesn't download every chart library.
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const FolderView = lazy(() => import("@/pages/FolderView").then((m) => ({ default: m.FolderView })));
const Duplicates = lazy(() => import("@/pages/Duplicates").then((m) => ({ default: m.Duplicates })));

function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="files" element={<FolderView />} />
          <Route path="files/:scanId" element={<FolderView />} />
          <Route path="files/:scanId/:dirId" element={<FolderView />} />
          <Route path="duplicates" element={<Duplicates />} />
          <Route path="duplicates/:scanId" element={<Duplicates />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
