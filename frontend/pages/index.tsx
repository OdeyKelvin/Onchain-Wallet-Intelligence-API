// ============================================================
//  Smart Money Analytics — pages/index.tsx
//  Main dashboard page
// ============================================================

import { useState, useCallback }   from "react";
import Head                         from "next/head";
import WalletTable                  from "@/components/WalletTable";
import VolumeChart                  from "@/components/VolumeChart";
import { getAnalytics, AnalyticsResponse } from "@/lib/api";

const PROVIDERS = [
  { value: "covalent",  label: "Covalent"  },
  { value: "alchemy",   label: "Alchemy"   },
  { value: "etherscan", label: "Etherscan" },
  { value: "mock",      label: "Mock (no API key)" },
];

const EXAMPLE_TOKENS = [
  { label: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { label: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { label: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { label: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA" },
];

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export default function Home() {
  const [tokenAddress, setTokenAddress] = useState<string>("");
  const [provider,     setProvider]     = useState<string>("covalent");
  const [inputError,   setInputError]   = useState<string | null>(null);
  const [data,    setData]    = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleFetch = useCallback(async (address: string, prov: string) => {
    if (!address.trim()) { setInputError("Please enter a token address."); return; }
    if (!ETH_ADDRESS_REGEX.test(address.trim())) { setInputError("Invalid address — must be 0x followed by 40 hex characters."); return; }
    setInputError(null); setError(null); setData(null); setLoading(true);
    try {
      const result = await getAnalytics(address.trim(), prov);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally { setLoading(false); }
  }, []);

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); handleFetch(tokenAddress, provider); }
  function handleExample(address: string) { setTokenAddress(address); handleFetch(address, provider); }

  return (
    <>
      <Head>
        <title>Smart Money Analytics</title>
        <meta name="description" content="Track top Ethereum wallets for any ERC20 token" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={s.page}>
        <header style={s.header}>
          <div style={s.headerInner}>
            <div style={s.logoRow}>
              <span style={s.logoIcon}>🧠</span>
              <div>
                <h1 style={s.logoTitle}>Smart Money Analytics</h1>
                <p style={s.logoSub}>Ethereum ERC20 on-chain intelligence</p>
              </div>
            </div>
            <span style={s.poweredBy}>Powered by Covalent · Alchemy · Etherscan</span>
          </div>
        </header>

        <main style={s.main}>
          <section style={s.searchPanel}>
            <form onSubmit={handleSubmit} style={s.form} noValidate>
              <div style={s.fieldGroup}>
                <label htmlFor="token-address" style={s.label}>ERC20 Token Contract Address</label>
                <input
                  id="token-address" type="text" value={tokenAddress}
                  onChange={(e) => { setTokenAddress(e.target.value); if (inputError) setInputError(null); }}
                  placeholder="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
                  style={{ ...s.input, ...(inputError ? s.inputError : {}) }}
                  spellCheck={false} autoComplete="off"
                  aria-describedby={inputError ? "address-error" : undefined}
                  aria-invalid={!!inputError}
                />
                {inputError && <p id="address-error" style={s.fieldError} role="alert">{inputError}</p>}
              </div>

              <div style={s.fieldGroup}>
                <label htmlFor="provider" style={s.label}>Data Provider</label>
                <select id="provider" value={provider} onChange={(e) => setProvider(e.target.value)} style={s.select}>
                  {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div style={s.fieldGroup}>
                <span style={s.label} aria-hidden>​</span>
                <button type="submit" style={{ ...s.analyseBtn, ...(loading ? s.analyseBtnDisabled : {}) }} disabled={loading}>
                  {loading ? "Fetching…" : "Analyse →"}
                </button>
              </div>
            </form>

            <div style={s.examplesRow}>
              <span style={s.examplesLabel}>Quick load:</span>
              {EXAMPLE_TOKENS.map((t) => (
                <button key={t.address} onClick={() => handleExample(t.address)} disabled={loading} style={s.exampleBtn} title={t.address}>
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {data?.data_provider?.includes("mock") && (
            <div style={s.mockBanner} role="alert">
              <strong>⚠ Demo data</strong> — all live providers were unavailable. Add your API keys to the backend <code style={s.inlineCode}>.env</code> and restart.
            </div>
          )}

          {error && (
            <div style={s.errorBanner} role="alert"><strong>Error:</strong> {error}</div>
          )}

          {(data || loading) && (
            <>
              {data && !loading && (
                <div style={s.metaStrip}>
                  <span style={s.metaItem}><span style={s.metaLabel}>Token: </span><code style={s.inlineCode}>{data.token_address ?? tokenAddress.toLowerCase()}</code></span>
                  <span style={s.metaDivider}>·</span>
                  <span style={s.metaItem}><span style={s.metaLabel}>Provider: </span><span style={s.metaValue}>{data.data_provider ?? provider}</span></span>
                  <span style={s.metaDivider}>·</span>
                  <span style={s.metaItem}><span style={s.metaLabel}>Wallets: </span><span style={s.metaValue}>{data.top_wallets.length}</span></span>
                </div>
              )}

              <section>
                <h2 style={s.sectionTitle}>Volume Distribution</h2>
                {loading ? <div style={s.chartSkeleton} /> : data ? <VolumeChart total_volume_usd={data.total_volume_usd} wallets={data.top_wallets} /> : null}
              </section>

              <section>
                <h2 style={s.sectionTitle}>Top Wallets</h2>
                {loading ? <div style={s.tableSkeleton}>{Array.from({ length: 6 }).map((_, i) => <div key={i} style={s.skeletonDataRow}><div style={{ ...s.skeletonCell, width: 160 }} /><div style={{ ...s.skeletonCell, width: 80 }} /><div style={{ ...s.skeletonCell, width: 110 }} /></div>)}</div> : data ? <WalletTable wallets={data.top_wallets} /> : null}
              </section>
            </>
          )}

          {!data && !loading && !error && (
            <div style={s.emptyState}>
              <p style={s.emptyIcon}>🔍</p>
              <p style={s.emptyTitle}>Enter a token address to get started</p>
              <p style={s.emptyHint}>Try one of the quick-load buttons above to explore USDC, WETH, or LINK.</p>
            </div>
          )}
        </main>

        <footer style={s.footer}>
          <span>Smart Money Analytics API</span>
          <span style={s.footerDot}>·</span>
          <a href="https://github.com/OdeyKelvin/smart-money-analytics-api" target="_blank" rel="noopener noreferrer" style={s.footerLink}>GitHub ↗</a>
          <span style={s.footerDot}>·</span>
          <span>Data: Covalent · Alchemy · Etherscan</span>
        </footer>
      </div>
    </>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0a0b0d", color: "#e8eaf0", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: "14px", lineHeight: 1.6 } as React.CSSProperties,
  header: { borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(10,11,13,0.95)", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(8px)" } as React.CSSProperties,
  headerInner: { maxWidth: "1100px", margin: "0 auto", padding: "0 24px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  logoRow: { display: "flex", alignItems: "center", gap: "12px" } as React.CSSProperties,
  logoIcon: { fontSize: "26px", lineHeight: 1 } as React.CSSProperties,
  logoTitle: { fontFamily: "'Syne', system-ui, sans-serif", fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#e8eaf0" } as React.CSSProperties,
  logoSub: { fontSize: "11px", color: "#6b7280", margin: 0 } as React.CSSProperties,
  poweredBy: { fontSize: "11px", color: "#374151" } as React.CSSProperties,
  main: { maxWidth: "1100px", margin: "0 auto", padding: "40px 24px 80px", display: "flex", flexDirection: "column", gap: "32px" } as React.CSSProperties,
  searchPanel: { background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "28px" } as React.CSSProperties,
  form: { display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" } as React.CSSProperties,
  fieldGroup: { display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: "200px" } as React.CSSProperties,
  label: { fontSize: "11px", letterSpacing: "0.07em", textTransform: "uppercase", color: "#6b7280" } as React.CSSProperties,
  input: { background: "#0a0b0d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e8eaf0", fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", padding: "10px 14px", outline: "none", width: "100%", transition: "border-color 0.15s", boxSizing: "border-box" } as React.CSSProperties,
  inputError: { borderColor: "#f87171" } as React.CSSProperties,
  fieldError: { color: "#f87171", fontSize: "11px", margin: 0 } as React.CSSProperties,
  select: { background: "#0a0b0d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e8eaf0", fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", padding: "10px 14px", outline: "none", width: "100%", cursor: "pointer", appearance: "none", WebkitAppearance: "none" } as React.CSSProperties,
  analyseBtn: { background: "#f59e0b", border: "none", borderRadius: "6px", color: "#000", cursor: "pointer", fontFamily: "'Syne', system-ui, sans-serif", fontSize: "14px", fontWeight: 700, padding: "10px 24px", whiteSpace: "nowrap", transition: "opacity 0.15s", width: "100%" } as React.CSSProperties,
  analyseBtnDisabled: { opacity: 0.45, cursor: "not-allowed" } as React.CSSProperties,
  examplesRow: { display: "flex", alignItems: "center", gap: "8px", marginTop: "18px", flexWrap: "wrap" } as React.CSSProperties,
  examplesLabel: { fontSize: "11px", color: "#4b5563" } as React.CSSProperties,
  exampleBtn: { background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", color: "#6b7280", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", padding: "3px 10px", transition: "all 0.12s" } as React.CSSProperties,
  mockBanner: { background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)", borderRadius: "6px", color: "#f59e0b", fontSize: "13px", padding: "12px 16px" } as React.CSSProperties,
  errorBanner: { background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)", borderRadius: "6px", color: "#f87171", fontSize: "13px", padding: "12px 16px" } as React.CSSProperties,
  inlineCode: { background: "rgba(255,255,255,0.07)", borderRadius: "3px", color: "#38bdf8", fontSize: "12px", padding: "1px 5px" } as React.CSSProperties,
  metaStrip: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", fontSize: "12px", color: "#6b7280", padding: "2px 0" } as React.CSSProperties,
  metaItem: { display: "inline-flex", gap: "4px", alignItems: "center" } as React.CSSProperties,
  metaLabel: { color: "#4b5563" } as React.CSSProperties,
  metaValue: { color: "#9ca3af" } as React.CSSProperties,
  metaDivider: { color: "#1f2937" } as React.CSSProperties,
  sectionTitle: { fontFamily: "'Syne', system-ui, sans-serif", fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em", color: "#e8eaf0", margin: "0 0 14px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.06)" } as React.CSSProperties,
  chartSkeleton: { width: "100%", height: "280px", borderRadius: "8px", background: "linear-gradient(90deg, #1a1e27 25%, #222633 50%, #1a1e27 75%)", backgroundSize: "200% 100%" } as React.CSSProperties,
  tableSkeleton: { background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", overflow: "hidden" } as React.CSSProperties,
  skeletonDataRow: { display: "flex", gap: "16px", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.03)" } as React.CSSProperties,
  skeletonCell: { height: "13px", borderRadius: "3px", background: "linear-gradient(90deg, #1a1e27 25%, #222633 50%, #1a1e27 75%)", backgroundSize: "200% 100%" } as React.CSSProperties,
  emptyState: { textAlign: "center", padding: "80px 24px", color: "#6b7280" } as React.CSSProperties,
  emptyIcon: { fontSize: "48px", marginBottom: "16px" } as React.CSSProperties,
  emptyTitle: { fontSize: "16px", color: "#9ca3af", margin: "0 0 8px" } as React.CSSProperties,
  emptyHint: { fontSize: "12px", margin: 0 } as React.CSSProperties,
  footer: { borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "20px 24px", fontSize: "11px", color: "#374151" } as React.CSSProperties,
  footerLink: { color: "#38bdf8", textDecoration: "none" } as React.CSSProperties,
  footerDot: { color: "#1f2937" } as React.CSSProperties,
} as const;
