import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { FolderView } from "@/pages/FolderView";
import { Duplicates } from "@/pages/Duplicates";
import { Landing } from "@/pages/Landing";
import RequireLaunch from "@/components/RequireLaunch";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/" element={<Layout />}>
        <Route
          path="dashboard"
          element={
            <RequireLaunch>
              <Dashboard />
            </RequireLaunch>
          }
        />
        <Route
          path="files"
          element={
            <RequireLaunch>
              <FolderView />
            </RequireLaunch>
          }
        />
        <Route
          path="files/:scanId"
          element={
            <RequireLaunch>
              <FolderView />
            </RequireLaunch>
          }
        />
        <Route
          path="duplicates"
          element={
            <RequireLaunch>
              <Duplicates />
            </RequireLaunch>
          }
        />
        <Route
          path="duplicates/:scanId"
          element={
            <RequireLaunch>
              <Duplicates />
            </RequireLaunch>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
