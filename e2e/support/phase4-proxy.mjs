import { request as requestHttp } from "node:http";

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
