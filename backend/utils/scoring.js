const WEIGHTS = { volume: 40, txCount: 30, typeBonus: 20, recency: 10 };
const TYPE_BONUS = { whale: 20, recurring: 12, new: 4 };
const TX_COUNT_CAP = 50;

export function scoreWallet(wallet, maxVolumeInSet, latestBlock = 0) {
  const volumeScore = maxVolumeInSet > 0
    ? (wallet.volume_usd / maxVolumeInSet) * WEIGHTS.volume : 0;

  const txScore = Math.min(wallet.tx_count / TX_COUNT_CAP, 1) * WEIGHTS.txCount;

  const typeScore = TYPE_BONUS[wallet.type] ?? 0;

  let recencyScore = 0;
  if (wallet.last_active_block && latestBlock > 0) {
    const blockGap    = latestBlock - wallet.last_active_block;
    const decay       = Math.max(0, 1 - blockGap / 10_000);
    recencyScore      = decay * WEIGHTS.recency;
  }

  const total = volumeScore + txScore + typeScore + recencyScore;
  return parseFloat(Math.min(total, 100).toFixed(1));
}

export function scoreAndRank(wallets) {
  if (!wallets || wallets.length === 0) return [];
  const maxVolume   = Math.max(...wallets.map((w) => w.volume_usd));
  const latestBlock = Math.max(...wallets.map((w) => w.last_active_block || 0));
  return wallets
    .map((wallet) => ({ ...wallet, score: scoreWallet(wallet, maxVolume, latestBlock) }))
    .sort((a, b) => b.score - a.score);
}

export function scoreSummary(scoredWallets) {
  if (!scoredWallets || scoredWallets.length === 0) {
    return { avg_score: 0, top_score: 0, score_distribution: {} };
  }
  const scores   = scoredWallets.map((w) => w.score);
  const avgScore = parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
  const topScore = Math.max(...scores);
  const distribution = {
    elite:    scoredWallets.filter((w) => w.score >= 80).length,
    strong:   scoredWallets.filter((w) => w.score >= 60 && w.score < 80).length,
    moderate: scoredWallets.filter((w) => w.score >= 40 && w.score < 60).length,
    weak:     scoredWallets.filter((w) => w.score < 40).length,
  };
  return { avg_score: avgScore, top_score: topScore, score_distribution: distribution };
}
