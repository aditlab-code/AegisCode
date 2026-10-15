/**
 * Resolves the base API URL for AegisCode backend services.
 * In development mode with Vite on port 5173, connects directly to port 8080
 * to avoid consuming the browser's 6-connection HTTP/1.1 limit with persistent SSE streams.
 * In production or standalone mode, uses relative paths.
 */
export function getApiBase(): string {
  if (typeof window === "undefined") {
    return typeof process !== "undefined" && process.env?.VITEST
      ? ""
      : "http://localhost:8080"
  }
  if (window.location?.port === "5173") {
    return `http://${window.location.hostname || "localhost"}:8080`
  }
  return ""
}

export const API_BASE = getApiBase()
