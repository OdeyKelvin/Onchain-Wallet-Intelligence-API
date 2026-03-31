// ============================================================
//  Onchain Wallet Intelligence — pages/index.tsx
//
//  Pure dashboard — no token input, no provider dropdown.
//  Auto-fetches on load. Renders summary cards, insights panel,
//  wallet table with score + trend columns.
// ============================================================

import { useState, useEffect } from "react";
import Head                     from "next/head";

interface Wallet {
  address:           string;
  type:              "whale" | "recurring" | "new";
  volume_usd:        number;
  tx_count:          number;
  last_active_block: number | null;
  score?:            number;
  trend?:            string;
}

interface Insights {
  market_signal: string;
  hot_wallets:   string[];
  avg_score:     number;
  top_score:     number;
  trend_summary: Record<string, number>;
  score_dist:    Record<string, number>;
}

interface IntelligenceData {
  token_address:    string;
  token_price_usd:  number;
  data_source:      string;
  top_wallets:      Wallet[];
  total_volume_usd: number;
  wallet_count:     number;
  breakdown:        { whales: number; recurring: number; new: number };
  insights:         Insights;
  scanned_blocks:   number;
  timestamp:        string;
}

const DEFAULT_TOKEN  = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
const DEFAULT_SYMBOL = "USDC";
const API_BASE       = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:3000";

function formatUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function signalColor(signal: string): string {
  if (signal === "bullish") return "#4ade80";
  if (signal === "bearish") return "#f87171";
  return "#f59e0b";
}

function trendColor(trend: string): string {
  switch (trend) {
    case "accumulating": return "#4ade80";
    case "distributing": return "#f87171";
    case "hot":          return "#f59e0b";
    case "dormant":      return "#374151";
    default:             return "#6b7280";
  }
}

function typeStyle(type: string): React.CSSProperties {
  switch (type) {
    case "whale":     return { background: "rgba(245,158,11,0.12)",  color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)"  };
    case "recurring": return { background: "rgba(56,189,248,0.1)",   color: "#38bdf8", border: "1px solid rgba(56,189,248,0.25)" };
    default:          return { background: "rgba(74,222,128,0.1)",   color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" };
  }
}

function typeEmoji(type: string): string {
  return type === "whale" ? "🐋" : type === "recurring" ? "🔁" : "🆕";
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={s.card}>
      <p style={{ ...s.cardLabel, color: accent }}>{label}</p>
      <p style={s.cardValue}>{value}</p>
      <p style={s.cardSub}>{sub}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct   = Math.min(score, 100);
  const color = pct >= 80 ? "#4ade80" : pct >= 60 ? "#f59e0b" : pct >= 40 ? "#38bdf8" : "#6b7280";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
      <div style={{ width: "56px", height: "4px", background: "#1f2937", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "2px" }} />
      </div>
      <span style={{ fontSize: "11px", color, minWidth: "30px", fontVariantNumeric: "tabular-nums" }}>
        {pct.toFixed(0)}
      </span>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div style={s.cardsGrid}>
      {[1,2,3,4].map((i) => (
        <div key={i} style={{ ...s.card, height: "100px", background: "linear-gradient(90deg,#1a1e27 25%,#222633 50%,#1a1e27 75%)", backgroundSize: "200% 100%" }} />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [data,        setData]        = useState<IntelligenceData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);

  useEffect(() => { load(false); }, []);

  async function load(forceRefresh: boolean) {
    if (forceRefresh) setRefreshing(true);
    else              setLoading(true);
    setError(null);

    try {
      const suffix = forceRefresh ? "/refresh" : "";
      const res    = await fetch(`${API_BASE}/intelligence/${DEFAULT_TOKEN}${suffix}`, {
        headers: { Accept: "application/json" },
        signal:  AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
      }

      const json: IntelligenceData = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  return (
    <>
      <Head>
        <title>Onchain Wallet Intelligence</title>
        <meta name="description" content="Real-time Ethereum wallet intelligence dashboard" />
        <meta name="viewport"    content="width=device-width, initial-scale=1" />
      </Head>

      <div style={s.page}>
        <header style={s.header}>
          <div style={s.headerInner}>
            <div style={s.logoRow}>
              <span style={{ fontSize: "24px" }}>🧠</span>
              <div>
                <h1 style={s.logoTitle}>Onchain Wallet Intelligence</h1>
                <p  style={s.logoSub}>
                  {DEFAULT_SYMBOL} · Top {data?.wallet_count ?? "—"} wallets · Auto-aggregated
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {lastUpdated && <span style={{ fontSize: "11px", color: "#4b5563" }}>Updated {lastUpdated}</span>}
              <button
                onClick={() => load(true)}
                disabled={refreshing || loading}
                style={{ ...s.refreshBtn, opacity: (refreshing || loading) ? 0.4 : 1 }}
              >
                {refreshing ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>
          </div>
        </header>

        <main style={s.main}>
          {data?.data_source?.includes("mock") && (
            <div style={s.mockBanner} role="alert">
              ⚠ <strong>Demo data</strong> — live providers unavailable.
              Add API keys to backend <code style={s.code}>.env</code>.
            </div>
          )}

          {error && (
            <div style={s.errorBanner} role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          {loading && <SkeletonCards />}

          {data && !loading && (
            <>
              <section style={s.cardsGrid}>
                <SummaryCard label="Total Volume"  value={formatUsd(data.total_volume_usd)}  sub={`${data.wallet_count} wallets · ${DEFAULT_SYMBOL}`}                accent="#f59e0b" />
                <SummaryCard label="Token Price"   value={data.token_price_usd > 0 ? `$${data.token_price_usd.toFixed(4)}` : "Unavailable"} sub={DEFAULT_SYMBOL + " via DeFiLlama"} accent="#38bdf8" />
                <SummaryCard label="Market Signal" value={data.insights.market_signal.toUpperCase()} sub={`Avg intelligence score: ${data.insights.avg_score}`}    accent={signalColor(data.insights.market_signal)} />
                <SummaryCard label="Whale Count"   value={String(data.breakdown.whales)}     sub={`${data.breakdown.recurring} recurring · ${data.breakdown.new} new`} accent="#a78bfa" />
              </section>

              <section>
                <h2 style={s.sectionTitle}>Intelligence Insights</h2>
                <div style={s.insightsGrid}>
                  <div style={s.insightCard}>
                    <p style={s.insightLabel}>Wallet Trends</p>
                    {Object.entries(data.insights.trend_summary).map(([trend, count]) => (
                      <div key={trend} style={s.insightRow}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: trendColor(trend), display: "inline-block" }} />
                          <span style={s.insightName}>{trend}</span>
                        </div>
                        <span style={s.insightVal}>{count} wallets</span>
                      </div>
                    ))}
                  </div>

                  <div style={s.insightCard}>
                    <p style={s.insightLabel}>Score Distribution</p>
                    {Object.entries(data.insights.score_dist).map(([tier, count]) => (
                      <div key={tier} style={s.insightRow}>
                        <span style={s.insightName}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
                        <span style={s.insightVal}>{count}</span>
                      </div>
                    ))}
                    <p style={{ fontSize: "11px", color: "#374151", margin: "4px 0 0" }}>
                      Top score: <strong style={{ color: "#e8eaf0" }}>{data.insights.top_score}</strong>
                    </p>
                  </div>

                  <div style={s.insightCard}>
                    <p style={s.insightLabel}>🔥 Hot Wallets</p>
                    {data.insights.hot_wallets.length === 0 ? (
                      <p style={{ fontSize: "11px", color: "#374151", margin: 0 }}>No wallets active in last 1,000 blocks</p>
                    ) : (
                      data.insights.hot_wallets.slice(0, 5).map((addr) => (
                        <div key={addr}>
                          <a href={`https://etherscan.io/address/${addr}`} target="_blank" rel="noopener noreferrer" style={s.addrLink}>
                            {truncate(addr)} ↗
                          </a>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={s.insightCard}>
                    <p style={s.insightLabel}>Data Info</p>
                    {[
                      ["Source",         data.data_source],
                      ["Blocks scanned", data.scanned_blocks?.toLocaleString()],
                      ["Token",          truncate(data.token_address)],
                      ["Fetched at",     new Date(data.timestamp).toLocaleTimeString()],
                    ].map(([label, val]) => (
                      <div key={label} style={s.insightRow}>
                        <span style={s.insightName}>{label}</span>
                        <span style={s.insightVal}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section>
                <h2 style={s.sectionTitle}>Top {data.top_wallets.length} Wallets</h2>
                <div style={s.tableWrap}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                          {["#", "Address", "Type", "Volume (USD)", "Tx Count", "Score", "Trend"].map((col, i) => (
                            <th key={col} style={{ ...s.th, textAlign: i >= 3 && i <= 5 ? "right" : "left" }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.top_wallets.map((wallet, i) => (
                          <tr key={wallet.address}
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.1s" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={{ ...s.td, color: "#374151", width: "36px" }}>{i + 1}</td>
                            <td style={s.td}>
                              <a href={`https://etherscan.io/address/${wallet.address}`} target="_blank" rel="noopener noreferrer" style={s.addrLink} title={wallet.address}>
                                {truncate(wallet.address)} ↗
                              </a>
                            </td>
                            <td style={s.td}>
                              <span style={{ ...s.badge, ...typeStyle(wallet.type) }}>
                                {typeEmoji(wallet.type)} {wallet.type}
                              </span>
                            </td>
                            <td style={{ ...s.td, textAlign: "right", fontWeight: 600, color: "#e8eaf0" }}>{formatUsd(wallet.volume_usd)}</td>
                            <td style={{ ...s.td, textAlign: "right", color: "#9ca3af" }}>{wallet.tx_count}</td>
                            <td style={{ ...s.td, textAlign: "right" }}><ScoreBar score={wallet.score ?? 0} /></td>
                            <td style={s.td}>
                              <span style={{ fontSize: "11px", color: trendColor(wallet.trend ?? "neutral"), textTransform: "capitalize" }}>
                                {wallet.trend ?? "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "10px 16px", fontSize: "11px", color: "#374151", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    {data.top_wallets.length} wallets · sorted by volume · {data.scanned_blocks?.toLocaleString()} blocks scanned
                  </div>
                </div>
              </section>
            </>
          )}
        </main>

        <footer style={s.footer}>
          <span>Onchain Wallet Intelligence API</span>
          <span style={{ color: "#1f2937" }}>·</span>
          <a href="https://github.com/OdeyKelvin/Onchain-Wallet-Intelligence-API" target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>GitHub ↗</a>
          <span style={{ color: "#1f2937" }}>·</span>
          <span>Data: Alchemy · Etherscan · Covalent</span>
        </footer>
      </div>
    </>
  );
}

const s = {
  page:        { minHeight: "100vh", background: "#0a0b0d", color: "#e8eaf0", fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: "13px", lineHeight: 1.6 } as React.CSSProperties,
  header:      { borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(10,11,13,0.95)", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(8px)" } as React.CSSProperties,
  headerInner: { maxWidth: "1200px", margin: "0 auto", padding: "0 24px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  logoRow:     { display: "flex", alignItems: "center", gap: "12px" } as React.CSSProperties,
  logoTitle:   { fontFamily: "'Syne',system-ui,sans-serif", fontSize: "17px", fontWeight: 700, margin: 0, color: "#e8eaf0", letterSpacing: "-0.02em" } as React.CSSProperties,
  logoSub:     { fontSize: "11px", color: "#4b5563", margin: 0 } as React.CSSProperties,
  refreshBtn:  { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "5px", color: "#9ca3af", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", padding: "6px 14px" } as React.CSSProperties,
  main:        { maxWidth: "1200px", margin: "0 auto", padding: "32px 24px 80px", display: "flex", flexDirection: "column", gap: "28px" } as React.CSSProperties,
  mockBanner:  { background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)", borderRadius: "6px", color: "#f59e0b", padding: "12px 16px" } as React.CSSProperties,
  errorBanner: { background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)", borderRadius: "6px", color: "#f87171", padding: "12px 16px" } as React.CSSProperties,
  code:        { background: "rgba(255,255,255,0.08)", borderRadius: "3px", padding: "1px 5px", color: "#38bdf8", fontSize: "11px" } as React.CSSProperties,
  cardsGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "16px" } as React.CSSProperties,
  card:        { background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "20px" } as React.CSSProperties,
  cardLabel:   { fontSize: "11px", letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 6px" } as React.CSSProperties,
  cardValue:   { fontFamily: "'Syne',system-ui,sans-serif", fontSize: "26px", fontWeight: 700, margin: "0 0 4px", color: "#e8eaf0", letterSpacing: "-0.02em" } as React.CSSProperties,
  cardSub:     { fontSize: "11px", color: "#4b5563", margin: 0 } as React.CSSProperties,
  sectionTitle:{ fontFamily: "'Syne',system-ui,sans-serif", fontSize: "14px", fontWeight: 700, color: "#e8eaf0", margin: "0 0 14px", paddingBottom: "10px", borderBottom: "1px solid rgba(255,255,255,0.06)" } as React.CSSProperties,
  insightsGrid:{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" } as React.CSSProperties,
  insightCard: { background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" } as React.CSSProperties,
  insightLabel:{ fontSize: "11px", letterSpacing: "0.07em", textTransform: "uppercase", color: "#6b7280", margin: 0 } as React.CSSProperties,
  insightRow:  { display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  insightName: { color: "#9ca3af", fontSize: "12px" } as React.CSSProperties,
  insightVal:  { color: "#e8eaf0", fontSize: "12px", fontWeight: 600 } as React.CSSProperties,
  addrLink:    { color: "#38bdf8", fontFamily: "monospace", fontSize: "12px", textDecoration: "none" } as React.CSSProperties,
  tableWrap:   { background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", overflow: "hidden" } as React.CSSProperties,
  th:          { padding: "10px 16px", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap" } as React.CSSProperties,
  td:          { padding: "11px 16px", color: "#e8eaf0", whiteSpace: "nowrap" } as React.CSSProperties,
  badge:       { display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 600 } as React.CSSProperties,
  footer:      { borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", padding: "20px 24px", fontSize: "11px", color: "#374151", flexWrap: "wrap" } as React.CSSProperties,
} as const;
