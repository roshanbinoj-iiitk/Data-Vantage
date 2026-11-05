import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DuplicateSortField, FileSortField, SortOrder } from "@/api/backend";

interface DuplicatesState {
  sortField: DuplicateSortField;
  sortDir: SortOrder;
  filterText: string;
}

interface FileTableState {
  sortField: FileSortField;
  sortDirection: SortOrder;
}

interface FiltersState {
  duplicates: DuplicatesState;
  fileTable: FileTableState;
}

interface FiltersContextValue extends FiltersState {
  setDuplicates: (s: Partial<DuplicatesState>) => void;
  setFileTable: (s: Partial<FileTableState>) => void;
  reset: () => void;
}

// Bumped when the stored shape changes, so stale values are ignored.
const STORAGE_KEY = "dv-filters-v2";

const defaultState: FiltersState = {
  duplicates: { sortField: "wasted", sortDir: "desc", filterText: "" },
  fileTable: { sortField: "name", sortDirection: "asc" },
};

const FiltersContext = createContext<FiltersContextValue | undefined>(undefined);

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function loadStored(): FiltersState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<FiltersState> | null;
    if (!parsed) return defaultState;
    const d = defaultState;
    return {
      duplicates: {
        sortField: oneOf(parsed.duplicates?.sortField, ["wasted", "size", "count", "name", "path"], d.duplicates.sortField),
        sortDir: oneOf(parsed.duplicates?.sortDir, ["asc", "desc"], d.duplicates.sortDir),
        filterText: "",
      },
      fileTable: {
        sortField: oneOf(parsed.fileTable?.sortField, ["name", "size", "extension", "modified"], d.fileTable.sortField),
        sortDirection: oneOf(parsed.fileTable?.sortDirection, ["asc", "desc"], d.fileTable.sortDirection),
      },
    };
  } catch {
    return defaultState;
  }
}

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FiltersState>(loadStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be unavailable (private mode); preferences just won't persist.
    }
  }, [state]);

  const setDuplicates = useCallback(
    (s: Partial<DuplicatesState>) => setState((p) => ({ ...p, duplicates: { ...p.duplicates, ...s } })),
    [],
  );
  const setFileTable = useCallback(
    (s: Partial<FileTableState>) => setState((p) => ({ ...p, fileTable: { ...p.fileTable, ...s } })),
    [],
  );
  const reset = useCallback(() => setState(defaultState), []);

  const value = useMemo(
    () => ({ ...state, setDuplicates, setFileTable, reset }),
    [state, setDuplicates, setFileTable, reset],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
  return ctx;
}
