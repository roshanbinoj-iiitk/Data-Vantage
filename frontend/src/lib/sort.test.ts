import { describe, expect, it } from "vitest";
import type { FileEntry } from "@/api/backend";
import { sortLocally } from "./sort";

const entry = (name: string, size: number, isDirectory = false): FileEntry => ({
  id: Math.random(),
  parentId: 0,
  path: `/r/${name}`,
  name,
  extension: name.includes(".") ? name.slice(name.lastIndexOf(".")) : "",
  size,
  sizeOnDisk: size,
  modifiedTime: 0,
  isDirectory,
  hash: "",
});

describe("sortLocally", () => {
  const files = [entry("b.txt", 10), entry("dir", 5, true), entry("a.txt", 30)];

  it("puts folders first when sorting by name", () => {
    expect(sortLocally(files, "name", "asc").map((f) => f.name)).toEqual(["dir", "a.txt", "b.txt"]);
  });

  it("sorts purely by size so the biggest items come first", () => {
    expect(sortLocally(files, "size", "desc").map((f) => f.name)).toEqual(["a.txt", "b.txt", "dir"]);
  });

  it("does not mutate its input", () => {
    const copy = [...files];
    sortLocally(files, "size", "asc");
    expect(files).toEqual(copy);
  });
});
