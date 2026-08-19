import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

async function sourceFiles(directory: string): Promise<string[]> {
  try {
    const metadata = await stat(directory);
    if (!metadata.isDirectory()) return [];
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

describe("module architecture", () => {
  it("keeps one internal HTTP seam and endpoint literals out of public code", async () => {
    const appRoot = resolve(projectRoot, "app");
    const violations: string[] = [];
    for (const path of await sourceFiles(appRoot)) {
      const relativePath = path.slice(projectRoot.length + 1).replaceAll("\\", "/");
      const source = await readFile(path, "utf8");
      const hasFetchOutsideSeam = /\bfetch\b/.test(source)
        && relativePath !== "app/adapters/http.ts";
      const hasEndpointOutsideAdapter = /["'`]\/api(?:\/|["'`])/.test(source)
        && !relativePath.startsWith("app/adapters/");
      if (hasFetchOutsideSeam || hasEndpointOutsideAdapter) {
        violations.push(relativePath);
      }
    }
    expect(violations).toEqual([]);
  });

  it("exposes the Phase 5 slug lookup through the catalog contract", async () => {
    const source = await readFile(resolve(projectRoot, "app/modules/venue-catalog.ts"), "utf8");
    expect(source).toContain("getBySlug(slug: string): Promise<Venue>");
  });
});
