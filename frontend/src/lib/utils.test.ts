import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, getFileIcon } from "./utils";

describe("formatBytes", () => {
  it("formats sizes with binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024 ** 3)).toBe("10 GB");
  });
  it("never indexes past the largest unit", () => {
    expect(formatBytes(1024 ** 7)).toMatch(/PB$/);
  });
});

describe("formatDuration", () => {
  it("uses the largest sensible unit", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(3725)).toBe("1h 2m");
  });
});

describe("getFileIcon", () => {
  it("is case-insensitive and tolerates a leading dot", () => {
    expect(getFileIcon(".PNG")).toBe(getFileIcon("png"));
    expect(getFileIcon("unknown")).toBe("📄");
  });
});
