import { ProviderError } from "./types.js";

export type FetchLike = typeof fetch;

export type JsonResponse = { status: number; body: unknown };

/**
 * HTTP call with timeout. Network errors, timeouts, 429 and 5xx are AMBIGUOUS:
 * the provider may or may not have acted, so callers must recover by lookup
 * before failing over (docs/37 "ambiguous create").
 */
export async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15000);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e) {
    throw new ProviderError("AMBIGUOUS", "NETWORK", `provider request failed: ${(e as Error).name}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text().catch(() => "");
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (res.status === 429 || res.status >= 500) {
    throw new ProviderError("AMBIGUOUS", `HTTP_${res.status}`, `provider returned ${res.status}`);
  }
  return { status: res.status, body };
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
export const str = (v: unknown): string | undefined => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);
