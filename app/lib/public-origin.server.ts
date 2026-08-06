const DEFAULT_PUBLIC_ORIGIN = "http://localhost";

function normalizeHttpOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const candidate = new URL(value);
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return null;
    }

    return candidate.origin;
  } catch {
    return null;
  }
}

/**
 * Resolves SEO URLs without trusting forwarded headers. The configured public
 * origin wins; otherwise the already-parsed request URL is the authority.
 */
export function resolvePublicOrigin(request: Request): string {
  return (
    normalizeHttpOrigin(process.env.MESTO_PUBLIC_ORIGIN) ??
    normalizeHttpOrigin(request.url) ??
    DEFAULT_PUBLIC_ORIGIN
  );
}
