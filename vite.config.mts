import { reactRouter } from "@react-router/dev/vite";
import { readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const legacyDocuments = new Map([
  ["/merchant", "merchant.html"],
  ["/merchant.html", "merchant.html"],
  ["/admin", "admin.html"],
  ["/admin.html", "admin.html"],
]);
const canonicalRedirects = new Map([
  ["/index.html", "/"],
  ["/index.html/", "/"],
  ["/help.html", "/help"],
  ["/help.html/", "/help"],
  ["/merchant.html", "/merchant"],
  ["/merchant.html/", "/merchant"],
  ["/admin.html", "/admin"],
  ["/admin.html/", "/admin"],
  ["/help/", "/help"],
  ["/merchant/", "/merchant"],
  ["/admin/", "/admin"],
]);

function legacyDocumentDevServer(): Plugin {
  return {
    name: "mesto-legacy-document-dev-server",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") return next();

        const pathname = new URL(request.url ?? "/", "http://mesto.local").pathname;
        const redirectLocation = canonicalRedirects.get(pathname);
        if (redirectLocation) {
          response.statusCode = 308;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Location", redirectLocation);
          response.end();
          return;
        }

        const sourceFile = legacyDocuments.get(pathname);
        if (!sourceFile) return next();

        try {
          const body = await readFile(resolve(projectRoot, sourceFile));
          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Content-Length", String(body.byteLength));
          response.end(request.method === "HEAD" ? undefined : body);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

function omitMigratedLegacyDocuments(): Plugin {
  const migratedDocuments = new Set(["index.html", "help.html"]);

  return {
    name: "mesto-omit-migrated-legacy-documents",
    apply: "build",
    async writeBundle(options) {
      if (!options.dir) return;
      const outputDirectory = resolve(projectRoot, options.dir);
      if (outputDirectory !== resolve(projectRoot, "build/client")) return;

      await Promise.all(
        [...migratedDocuments].map((document) =>
          rm(resolve(outputDirectory, document), { force: true }),
        ),
      );
    },
  };
}

export default defineConfig({
  plugins: [legacyDocumentDevServer(), omitMigratedLegacyDocuments(), reactRouter()],
  publicDir: ".legacy-public",
});
