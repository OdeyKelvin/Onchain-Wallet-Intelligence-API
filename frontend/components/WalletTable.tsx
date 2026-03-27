import { useState, useMemo } from "react";

export interface Wallet {
  address:    string;
  type:       "new" | "recurring" | "whale";
  volume_usd: number;
}

interface WalletTableProps { wallets: Wallet[]; }

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function typeMeta(type: Wallet["type"]): { label: string; emoji: string; style: React.CSSProperties } {
  switch (type) {
    case "whale":     return { label: "Whale",     emoji: "🐋", style: { background: "rgba(245,158,11,0.12)",  color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)"  } };
    case "recurring": return { label: "Recurring", emoji: "🔁", style: { background: "rgba(56,189,248,0.1)",   color: "#38bdf8", border: "1px solid rgba(56,189,248,0.25)"  } };
    case "new":       return { label: "New",       emoji: "🆕", style: { background: "rgba(74,222,128,0.1)",   color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)"  } };
  }
}

function TypeBadge({ type }: { type: Wallet["type"] }) {
  const { label, emoji, style } = typeMeta(type);
  return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", ...style }}>{emoji} {label}</span>;
}

export default function WalletTable({ wallets }: WalletTableProps) {
  type SortKey = "volume_usd" | "type" | "address";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("volume_usd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = useMemo(() => [...wallets].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "volume_usd") cmp = a.volume_usd - b.volume_usd;
    else if (sortKey === "type")  cmp = a.type.localeCompare(b.type);
    else                          cmp = a.address.localeCompare(b.address);
    return sortDir === "desc" ? -cmp : cmp;
  }), [wallets, sortKey, sortDir]);

  if (wallets.length === 0) return <div style={{ padding: "48px 24px", textAlign: "center", color: "#6b7280", fontSize: "13px", background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px" }}>No wallet data to display.</div>;

  const thStyle = (key: SortKey, align: "left" | "right" = "left"): React.CSSProperties => ({
    padding: "10px 16px", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500,
    whiteSpace: "nowrap", textAlign: align, cursor: "pointer", userSelect: "none",
    color: sortKey === key ? "#e8eaf0" : "#6b7280",
  });

  return (
    <div style={{ background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", overflow: "hidden", fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: "13px" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <th style={thStyle("address")}    onClick={() => handleSort("address")}   >#  Address {sortKey === "address"    ? (sortDir === "desc" ? "↓" : "↑") : "↕"}</th>
              <th style={thStyle("type")}       onClick={() => handleSort("type")}      >Type {sortKey === "type"       ? (sortDir === "desc" ? "↓" : "↑") : "↕"}</th>
              <th style={thStyle("volume_usd", "right")} onClick={() => handleSort("volume_usd")}>Volume (USD) {sortKey === "volume_usd" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((wallet, index) => (
              <tr key={wallet.address} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td style={{ padding: "12px 16px", color: "#e8eaf0", whiteSpace: "nowrap" }}>
                  <span style={{ color: "#374151", fontSize: "12px", marginRight: "12px" }}>{index + 1}</span>
                  <a href={`https://etherscan.io/address/${wallet.address}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px", textDecoration: "none" }} title={wallet.address}>
                    <span style={{ color: "#38bdf8", fontFamily: "monospace", fontSize: "12px" }}>{truncateAddress(wallet.address)}</span>
                    <span style={{ color: "#6b7280", fontSize: "10px" }}>↗</span>
                  </a>
                </td>
                <td style={{ padding: "12px 16px" }}><TypeBadge type={wallet.type} /></td>
                <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#e8eaf0" }}>{formatUsd(wallet.volume_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 16px", fontSize: "11px", color: "#6b7280", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {wallets.length} wallets · sorted by <strong style={{ color: "#e8eaf0" }}>{sortKey === "volume_usd" ? "Volume" : sortKey === "type" ? "Type" : "Address"}</strong> ({sortDir === "desc" ? "high → low" : "low → high"})
      </div>
    </div>
  );
}
