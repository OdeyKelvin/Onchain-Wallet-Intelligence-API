const HOT_BLOCK_WINDOW       = 1_000;
const DORMANT_BLOCK_THRESHOLD = 10_000;
const ACCUMULATION_TX_MIN    = 5;

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function getLatestBlock(wallets) {
  return Math.max(0, ...wallets.map((w) => w.last_active_block || 0));
}

export function classifyTrend(wallet, medianVolume, latestBlock) {
  const blockGap = wallet.last_active_block
    ? latestBlock - wallet.last_active_block
    : Infinity;

  if (blockGap > DORMANT_BLOCK_THRESHOLD)                                           return "dormant";
  if (blockGap <= HOT_BLOCK_WINDOW)                                                  return "hot";
  if (wallet.tx_count >= ACCUMULATION_TX_MIN && wallet.volume_usd >= medianVolume)   return "accumulating";
  if (wallet.tx_count >= ACCUMULATION_TX_MIN && wallet.volume_usd < medianVolume)    return "distributing";
  return "neutral";
}

export function analyseTrends(wallets) {
  if (!wallets || wallets.length === 0) {
    return {
      summary:       { accumulating: 0, distributing: 0, hot: 0, dormant: 0, neutral: 0 },
      hot_wallets:   [],
      market_signal: "neutral",
      median_volume: 0,
      latest_block:  0,
      volume_by_trend: {},
      wallets:       [],
    };
  }

  const latestBlock  = getLatestBlock(wallets);
  const medianVolume = median(wallets.map((w) => w.volume_usd));

  const tagged = wallets.map((wallet) => ({
    ...wallet,
    trend: classifyTrend(wallet, medianVolume, latestBlock),
  }));

  const summary = {
    accumulating: tagged.filter((w) => w.trend === "accumulating").length,
    distributing: tagged.filter((w) => w.trend === "distributing").length,
    hot:          tagged.filter((w) => w.trend === "hot").length,
    dormant:      tagged.filter((w) => w.trend === "dormant").length,
    neutral:      tagged.filter((w) => w.trend === "neutral").length,
  };

  const volumeByTrend = {
    accumulating: parseFloat(tagged.filter((w) => w.trend === "accumulating").reduce((s, w) => s + w.volume_usd, 0).toFixed(2)),
    distributing: parseFloat(tagged.filter((w) => w.trend === "distributing").reduce((s, w) => s + w.volume_usd, 0).toFixed(2)),
    hot:          parseFloat(tagged.filter((w) => w.trend === "hot").reduce((s, w) => s + w.volume_usd, 0).toFixed(2)),
  };

  let marketSignal = "neutral";
  if (summary.accumulating > summary.distributing * 1.5) marketSignal = "bullish";
  if (summary.distributing > summary.accumulating * 1.5) marketSignal = "bearish";

  return {
    summary,
    volume_by_trend:  volumeByTrend,
    market_signal:    marketSignal,
    median_volume:    parseFloat(medianVolume.toFixed(2)),
    latest_block:     latestBlock,
    hot_wallets:      tagged.filter((w) => w.trend === "hot").map((w) => w.address),
    wallets:          tagged,
  };
}
