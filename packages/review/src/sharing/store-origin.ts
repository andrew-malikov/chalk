const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The canonical form of one store origin: `https://host[:port]`, or
 * `http://` for a local development store. Any other URL is an error.
 */
export function normalizeStoreOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`The account service origin is not a URL: ${value}`);
  }

  const local = LOCAL_HOSTS.has(url.hostname);
  const secure = url.protocol === "https:";

  if (!secure && !(local && url.protocol === "http:")) {
    throw new Error(
      `The account service origin must use https (http is allowed for localhost): ${value}`,
    );
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      `The account service origin must be a bare origin without a path, query, or login: ${value}`,
    );
  }

  return url.origin;
}
