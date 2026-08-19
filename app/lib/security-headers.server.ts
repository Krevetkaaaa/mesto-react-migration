import { randomBytes } from "node:crypto";

import { SECURITY_HEADERS } from "./security-headers";

const NONCE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;

export function createCspNonce() {
  return randomBytes(18).toString("base64");
}

export function contentSecurityPolicyWithNonce(nonce: string) {
  if (!NONCE_PATTERN.test(nonce)) throw new TypeError("CSP nonce must be a base64 value");

  const policy = SECURITY_HEADERS["Content-Security-Policy"];
  if (!policy.includes("script-src 'self'") || !policy.includes("style-src 'self'")) {
    throw new Error("The canonical CSP is missing nonce insertion points");
  }

  return policy
    .replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
    .replace("style-src 'self'", `style-src 'self' 'nonce-${nonce}'`);
}
