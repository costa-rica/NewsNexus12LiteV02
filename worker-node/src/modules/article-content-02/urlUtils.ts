const GOOGLE_HOST_PATTERNS = [
  "google.com",
  "googleusercontent.com",
  "gstatic.com",
  "g.co",
  "goo.gl",
  "youtube.com",
  "youtu.be",
];

export function isGoogleOwnedUrl(candidate: string) {
  try {
    const hostname = new URL(candidate).hostname.toLowerCase();

    return GOOGLE_HOST_PATTERNS.some(
      (pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`),
    );
  } catch {
    return true;
  }
}

export function toAbsoluteUrl(candidate: string | undefined, baseUrl?: string) {
  const trimmedCandidate = candidate?.trim();

  if (!trimmedCandidate) {
    return undefined;
  }

  try {
    return new URL(trimmedCandidate, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
