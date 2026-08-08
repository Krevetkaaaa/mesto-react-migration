import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = resolve(projectRoot, ".legacy-public");
const manifestName = "legacy-static-manifest.json";
const verifyOnly = process.argv.includes("--check");

const rootFileWhitelist = Object.freeze([
  "admin-overrides.css",
  "admin.css",
  "admin.html",
  "admin.js",
  "ambient-premium.css",
  "app.js",
  "editorial-sections.css",
  "gastro-theme.css",
  "help.css",
  "help.html",
  "index.html",
  "merchant.css",
  "merchant.html",
  "merchant.js",
  "password-policy.mjs",
  "phone-premium.css",
  "styles.css",
  "theme.js",
]);
const directoryWhitelist = Object.freeze(["assets"]);

function assertInsideProject(path, label) {
  const pathFromRoot = relative(projectRoot, path);
  if (pathFromRoot === "" || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") {
    throw new Error(`${label} resolves outside the project: ${path}`);
  }
}

async function listFiles(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = resolve(directory, entry.name);
    const outputPath = `${prefix}/${entry.name}`.replaceAll("\\", "/");

    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in legacy static staging: ${outputPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath, outputPath)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, outputPath });
    }
  }

  return files;
}

async function sourceFiles() {
  const files = rootFileWhitelist.map((outputPath) => ({
    absolutePath: resolve(projectRoot, outputPath),
    outputPath,
  }));

  for (const directory of directoryWhitelist) {
    files.push(...(await listFiles(resolve(projectRoot, directory), directory)));
  }

  return files.sort((left, right) => left.outputPath.localeCompare(right.outputPath));
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function expectedManifest(files) {
  const entries = [];

  for (const file of files) {
    assertInsideProject(file.absolutePath, file.outputPath);
    const metadata = await stat(file.absolutePath);
    if (!metadata.isFile()) throw new Error(`Missing whitelisted legacy file: ${file.outputPath}`);
    const contents = await readFile(file.absolutePath);
    entries.push({
      path: file.outputPath,
      bytes: contents.byteLength,
      sha256: sha256(contents),
    });
  }

  return {
    schemaVersion: 1,
    algorithm: "sha256",
    files: entries,
  };
}

async function verifyStaging(manifest) {
  const manifestPath = resolve(generatedRoot, manifestName);
  const stagedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (JSON.stringify(stagedManifest) !== JSON.stringify(manifest)) {
    throw new Error("Legacy static manifest is stale; run npm run prepare");
  }

  const stagedFiles = await listFiles(generatedRoot, "");
  const actualPaths = stagedFiles
    .map(({ outputPath }) => outputPath.replace(/^\//, ""))
    .filter((outputPath) => outputPath !== manifestName)
    .sort();
  const expectedPaths = manifest.files.map(({ path }) => path).sort();

  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error("Legacy static staging contains missing or non-whitelisted files");
  }

  for (const entry of manifest.files) {
    const contents = await readFile(resolve(generatedRoot, entry.path));
    if (contents.byteLength !== entry.bytes || sha256(contents) !== entry.sha256) {
      throw new Error(`Legacy staged file does not match its source: ${entry.path}`);
    }
  }
}

const files = await sourceFiles();
const manifest = await expectedManifest(files);

if (verifyOnly) {
  await verifyStaging(manifest);
  process.stdout.write(`Verified ${manifest.files.length} legacy static files by SHA-256.\n`);
} else {
  const temporaryRoot = resolve(projectRoot, `.legacy-public.stage-${process.pid}`);
  assertInsideProject(generatedRoot, "generated legacy directory");
  assertInsideProject(temporaryRoot, "temporary legacy directory");

  await rm(temporaryRoot, { recursive: true, force: true });
  await mkdir(temporaryRoot, { recursive: true });

  try {
    for (const file of files) {
      const destination = resolve(temporaryRoot, file.outputPath);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(file.absolutePath, destination);
    }

    await writeFile(
      resolve(temporaryRoot, manifestName),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await rm(generatedRoot, { recursive: true, force: true });
    await rename(temporaryRoot, generatedRoot);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }

  process.stdout.write(`Staged ${manifest.files.length} whitelisted legacy files with SHA-256 manifest.\n`);
}
