const AUTH_SESSION_TOKEN_KEY = "econorotas:session-token";

export function readAuthSessionToken() {
  return null;
}

export function saveAuthSessionToken(token?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
}

export function clearAuthSessionToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
}
