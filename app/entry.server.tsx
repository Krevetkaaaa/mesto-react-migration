import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";

import { contentSecurityPolicyWithNonce, createCspNonce } from "./lib/security-headers.server";
import { beginDocumentRequest, documentRequestId } from "./lib/telemetry.server";

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  const nonce = createCspNonce();
  const requestId = documentRequestId(request);
  const telemetry = beginDocumentRequest(request, requestId);
  responseHeaders.set("Content-Security-Policy", contentSecurityPolicyWithNonce(nonce));
  responseHeaders.set("X-Request-ID", requestId);

  if (request.method.toUpperCase() === "HEAD") {
    telemetry.complete(responseStatusCode);
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1_000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} nonce={nonce} url={request.url} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              telemetry.complete(responseStatusCode);
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          pipe(body);
          resolve(new Response(stream, {
            headers: responseHeaders,
            status: responseStatusCode,
          }));
        },
        onShellError(error: unknown) {
          telemetry.fail(error);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            telemetry.fail(error);
            console.error(error);
          }
        },
      },
    );
  });
}
