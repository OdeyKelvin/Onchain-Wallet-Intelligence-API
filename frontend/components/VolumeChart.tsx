// Install first:  npm install recharts

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

interface Wallet { type: "whale" | "recurring" | "new"; volume_usd: number; }
interface VolumeChartProps { total_volume_usd: number; wallets?: Wallet[]; }

const TYPE_COLORS: Record<string, string> = { Whale: "#f59e0b", Recurring: "#38bdf8", New: "#4ade80" };
const FALLBACK_SPLIT = { Whale: 0.70, Recurring: 0.20, New: 0.10 };

function formatAxisUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatFullUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; volume: number; share: number } }> }) {
  if (!active || !payload?.length) return null;
  const { name, volume, share } = payload[0].payload;
  return (
    <div style={{ background: "#1a1e27", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", padding: "10px 14px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "12px" }}>
      <p style={{ color: TYPE_COLORS[name], fontWeight: 600, marginBottom: "4px" }}>{name} Wallets</p>
      <p style={{ color: "#e8eaf0", fontSize: "14px", fontWeight: 700, marginBottom: "2px" }}>{formatFullUsd(volume)}</p>
      <p style={{ color: "#6b7280", fontSize: "11px" }}>{share.toFixed(1)}% of total volume</p>
    </div>
  );
}

export default function VolumeChart({ total_volume_usd, wallets }: VolumeChartProps) {
  const chartData = (() => {
    if (wallets && wallets.length > 0) {
      const sums: Record<string, number> = { Whale: 0, Recurring: 0, New: 0 };
      for (const w of wallets) {
        const key = w.type.charAt(0).toUpperCase() + w.type.slice(1);
        if (key in sums) sums[key] += w.volume_usd;
      }
      return Object.entries(sums).map(([name, volume]) => ({ name, volume, share: total_volume_usd > 0 ? (volume / total_volume_usd) * 100 : 0 }));
    }
    return Object.entries(FALLBACK_SPLIT).map(([name, ratio]) => ({ name, volume: total_volume_usd * ratio, share: ratio * 100 }));
  })();

  if (total_volume_usd === 0) return <div style={{ background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "24px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "200px" }}><p style={{ color: "#6b7280", fontSize: "13px" }}>No volume data to display.</p></div>;

  return (
    <div style={{ background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "24px", fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px" }}>
        <div>
          <p style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: "4px" }}>Total Volume</p>
          <p style={{ fontSize: "28px", fontWeight: 700, color: "#e8eaf0", letterSpacing: "-0.02em", lineHeight: 1 }}>{formatFullUsd(total_volume_usd)}</p>
        </div>
        <p style={{ fontSize: "11px", color: "#374151" }}>{wallets ? "Live breakdown" : "Estimated split"} by wallet type</p>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 24, right: 16, left: 8, bottom: 8 }} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.07)" }} />
          <YAxis tickFormatter={formatAxisUsd} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} width={72} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="volume" position="top" formatter={(v: number) => formatAxisUsd(v)} style={{ fill: "#9ca3af", fontSize: 10 }} />
            {chartData.map((entry) => <Cell key={entry.name} fill={TYPE_COLORS[entry.name] ?? "#6b7280"} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginTop: "16px", flexWrap: "wrap" }}>
        {chartData.map((entry) => (
          <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: TYPE_COLORS[entry.name], flexShrink: 0 }} />
            <span style={{ color: "#9ca3af" }}>{entry.name}</span>
            <span style={{ color: "#e8eaf0", fontWeight: 600 }}>{entry.share.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
