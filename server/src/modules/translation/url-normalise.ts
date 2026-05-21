/**
 * Normalise a source page URL so that saves from the same content group together.
 * Drops query strings, fragments, and known timestamp params; lowercases the host;
 * removes a trailing slash. Returns the input unchanged when it cannot be parsed.
 */
export function normaliseSourceUrl(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  const trimmed = raw.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();

  let normalised = url.toString();

  // Drop a single trailing slash on the path (but keep the root "/").
  if (normalised.endsWith("/") && url.pathname !== "/") {
    normalised = normalised.slice(0, -1);
  }

  return normalised;
}
