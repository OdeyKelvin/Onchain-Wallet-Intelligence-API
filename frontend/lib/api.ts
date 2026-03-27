const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:3000";

export interface Wallet {
  address:            string;
  type:               "new" | "recurring" | "whale";
  volume_usd:         number;
  tx_count?:          number;
  last_active_block?: number | null;
}

export interface AnalyticsResponse {
  top_wallets:      Wallet[];
  total_volume_usd: number;
  token_address?:   string;
  data_provider?:   string;
  scanned_blocks?:  number;
  timestamp?:       string;
}

interface ApiErrorBody { error: string; detail?: string; }

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "ApiError"; this.status = status; }
}

async function apiFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.set(k, String(v)); });

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError"
      ? "Request timed out. The Render server may be waking up — try again."
      : `Network error: cannot reach ${BASE_URL}. Check NEXT_PUBLIC_API_URL in .env.local.`;
    throw new ApiError(message, 0);
  }

  let body: T | ApiErrorBody;
  try { body = await response.json(); } catch { throw new ApiError(`Non-JSON response (status ${response.status}).`, response.status); }

  if (!response.ok) {
    const e = body as ApiErrorBody;
    throw new ApiError(e.detail ? `${e.error}: ${e.detail}` : e.error ?? `HTTP ${response.status}`, response.status);
  }
  return body as T;
}

export async function getAnalytics(tokenAddress: string, provider?: string): Promise<AnalyticsResponse> {
  return apiFetch<AnalyticsResponse>(`/analytics/${encodeURIComponent(tokenAddress)}`, { provider });
}

export async function getProviders(): Promise<string[]> {
  const data = await apiFetch<{ providers: string[] }>("/providers");
  return data.providers;
}

export async function checkHealth(): Promise<boolean> {
  try { await apiFetch("/"); return true; } catch { return false; }
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

export function walletMeta(type: Wallet["type"]): { label: string; emoji: string; color: string } {
  switch (type) {
    case "whale":     return { label: "Whale",     emoji: "🐋", color: "#f59e0b" };
    case "recurring": return { label: "Recurring", emoji: "🔁", color: "#38bdf8" };
    case "new":       return { label: "New",       emoji: "🆕", color: "#4ade80" };
  }
}
