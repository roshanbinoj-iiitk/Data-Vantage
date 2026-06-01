import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type DuplicatesSortField = "name" | "size" | "path" | "count" | "wasted";
type SortDir = "asc" | "desc";
type FileTableSortField = "name" | "size" | "extension";

interface DuplicatesState {
  sortField: DuplicatesSortField;
  sortDir: SortDir;
  filterText: string;
}

interface FileTableState {
  sortField: FileTableSortField;
  sortDirection: SortDir;
}

interface FiltersState {
  globalSearch: string;
  isSearching: boolean;
  duplicates: DuplicatesState;
  fileTable: FileTableState;
}

interface FiltersContextValue extends FiltersState {
  setGlobalSearch: (s: string) => void;
  setIsSearching: (b: boolean) => void;
  setDuplicates: (s: Partial<DuplicatesState>) => void;
  setFileTable: (s: Partial<FileTableState>) => void;
  reset: () => void;
}

const STORAGE_KEY = "dv-filters";

const defaultState: FiltersState = {
  globalSearch: "",
  isSearching: false,
  duplicates: { sortField: "wasted", sortDir: "desc", filterText: "" },
  fileTable: { sortField: "name", sortDirection: "asc" },
};

const FiltersContext = createContext<FiltersContextValue | undefined>(
  undefined,
);

function loadStored(): FiltersState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);

    const parsedFileTable = (parsed as Partial<FiltersState> | null)?.fileTable;
    const rawSortField = (parsedFileTable as Partial<FileTableState> | null)
      ?.sortField as unknown;
    const rawSortDirection = (parsedFileTable as Partial<FileTableState> | null)
      ?.sortDirection as unknown;

    const sortField: FileTableSortField =
      rawSortField === "size" || rawSortField === "extension" || rawSortField === "name"
        ? rawSortField
        : "name";

    const sortDirection: SortDir =
      rawSortDirection === "desc" || rawSortDirection === "asc"
        ? rawSortDirection
        : defaultState.fileTable.sortDirection;

    return {
      ...defaultState,
      ...(parsed as Partial<FiltersState>),
      fileTable: { sortField, sortDirection },
    } as FiltersState;
  } catch {
    return defaultState;
  }
}

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FiltersState>(() => loadStored());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const setGlobalSearch = useCallback(
    (s: string) => setState((p) => ({ ...p, globalSearch: s })),
    [],
  );
  const setIsSearching = useCallback(
    (b: boolean) => setState((p) => ({ ...p, isSearching: b })),
    [],
  );
  const setDuplicates = useCallback(
    (s: Partial<DuplicatesState>) =>
      setState((p) => ({ ...p, duplicates: { ...p.duplicates, ...s } })),
    [],
  );
  const setFileTable = useCallback(
    (s: Partial<FileTableState>) =>
      setState((p) => ({ ...p, fileTable: { ...p.fileTable, ...s } })),
    [],
  );

  const reset = useCallback(() => setState(defaultState), []);

  const value = useMemo(
    () => ({
      ...state,
      setGlobalSearch,
      setIsSearching,
      setDuplicates,
      setFileTable,
      reset,
    }),
    [state],
  );

  return (
    <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
  return ctx;
}

export type { DuplicatesSortField, FileTableSortField, SortDir };
