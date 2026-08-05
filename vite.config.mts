import { reactRouter } from "@react-router/dev/vite";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const legacyDocuments = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/help", "help.html"],
  ["/help.html", "help.html"],
  ["/merchant", "merchant.html"],
  ["/merchant.html", "merchant.html"],
  ["/admin", "admin.html"],
  ["/admin.html", "admin.html"],
]);

function legacyDocumentDevServer(): Plugin {
  return {
    name: "mesto-legacy-document-dev-server",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") return next();

        const pathname = new URL(request.url ?? "/", "http://mesto.local").pathname;
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

export default defineConfig({
  plugins: [legacyDocumentDevServer(), reactRouter()],
  publicDir: ".legacy-public",
});
