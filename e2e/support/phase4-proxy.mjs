import { request as requestHttp } from "node:http";

const LOCAL_VERCEL_OBSERVABILITY_SCRIPTS = new Set([
  "/_vercel/insights/script.js",
  "/_vercel/speed-insights/script.js",
]);

export function serveLocalVercelObservability(request, response, pathname) {
  if (!LOCAL_VERCEL_OBSERVABILITY_SCRIPTS.has(pathname)) return false;
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" });
    response.end();
    return true;
  }
  const body = "/* Vercel observability is provided by the platform outside this local fixture. */\n";
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/javascript; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-E2E-Fixture": "phase4-vercel-observability",
  });
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
}

export function proxyHttpRequest(request, response, { host, targetPort }) {
  let activeUpstreamResponse;
  let completed = false;
  let downstreamCancelled = false;
  const upstream = requestHttp({
    host,
    port: targetPort,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: request.headers.host || `${host}:${targetPort}` },
  }, (upstreamResponse) => {
    activeUpstreamResponse = upstreamResponse;
    const closeIncompleteResponse = () => {
      if (!completed && !response.destroyed) response.destroy();
    };
    upstreamResponse.once("aborted", closeIncompleteResponse);
    upstreamResponse.once("error", closeIncompleteResponse);
    upstreamResponse.once("end", () => {
      completed = true;
    });
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  const cancelUpstream = () => {
    if (completed) return;
    downstreamCancelled = true;
    activeUpstreamResponse?.destroy();
    upstream.destroy();
  };
  request.once("aborted", cancelUpstream);
  response.once("close", () => {
    if (!response.writableEnded) cancelUpstream();
  });
  upstream.once("error", (error) => {
    if (downstreamCancelled || response.destroyed || response.writableEnded) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ message: `Phase 4 upstream is unavailable: ${error.message}` }));
  });
  request.pipe(upstream);
}
