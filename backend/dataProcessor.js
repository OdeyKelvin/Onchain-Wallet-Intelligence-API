// ============================================================
//  Onchain Wallet Intelligence API — dataProcessor.js
//
//  Key behaviours:
//    ✅ Auto multi-provider (Alchemy + Etherscan, no user input)
//    ✅ Aggregates + deduplicates wallets across all providers
//    ✅ In-memory cache (default 10 min TTL) to avoid rate limits
//    ✅ Returns top 20–50 wallets only — no raw tx data
//    ✅ Volume fixed: uses token amount (not metadata.value which is often null)
//    ✅ Enriches each wallet with score + trend via utils/
// ============================================================

import axios                        from "axios";
import { scoreAndRank, scoreSummary } from "./utils/scoring.js";
import { analyseTrends }              from "./utils/trend.js";

// ─────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────

const ALCHEMY_KEY    = process.env.ALCHEMY_API_KEY   || null;
const ETHERSCAN_KEY  = process.env.ETHERSCAN_API_KEY || null;
const COVALENT_KEY   = process.env.COVALENT_API_KEY  || null;

const TOP_N          = parseInt(process.env.TOP_WALLET_LIMIT          || "50",    10); // 20–50
const LOOKBACK       = parseInt(process.env.LOOKBACK_BLOCKS           || "50000", 10);
const WHALE_USD      = parseFloat(process.env.WHALE_VOLUME_THRESHOLD_USD || "100000");
const RECURRING_TX   = parseInt(process.env.RECURRING_TX_COUNT        || "3",     10);
const CACHE_TTL_MS   = parseInt(process.env.CACHE_TTL_SECONDS         || "600",   10) * 1000; // default 10 min

// ─────────────────────────────────────────────────────────────
//  IN-MEMORY CACHE
//  Keyed by tokenAddress. Prevents hammering all 3 providers
//  on every request. Cache entry: { data, expiresAt }
//
//  To extend: swap for Redis with ioredis for multi-instance deploys.
//    import Redis from "ioredis";
//    const redis = new Redis(process.env.REDIS_URL);
// ─────────────────────────────────────────────────────────────

const cache = new Map();

function getCached(tokenAddress) {
  const entry = cache.get(tokenAddress.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(tokenAddress.toLowerCase());
    return null;
  }
  console.log(`[cache] HIT for ${tokenAddress} — expires in ${Math.round((entry.expiresAt - Date.now()) / 1000)}s`);
  return entry.data;
}

function setCache(tokenAddress, data) {
  cache.set(tokenAddress.toLowerCase(), {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  console.log(`[cache] SET for ${tokenAddress} — TTL ${CACHE_TTL_MS / 1000}s`);
}

/** Manually clear the cache for a token (useful for forced refresh). */
export function clearCache(tokenAddress) {
  if (tokenAddress) {
    cache.delete(tokenAddress.toLowerCase());
  } else {
    cache.clear(); // clear all
  }
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

/** Current Ethereum block (approximated from genesis timestamp). */
function getCurrentBlock() {
  // Genesis: July 30 2015 (Unix: 1438269988), ~12s per block
  return Math.floor((Date.now() / 1000 - 1438269988) / 12);
}

/** Classify a wallet as whale / recurring / new. */
function classifyType(volumeUsd, txCount) {
  if (volumeUsd >= WHALE_USD)    return "whale";
  if (txCount   >= RECURRING_TX) return "recurring";
  return "new";
}

/**
 * Merge two wallet maps (Map<address, aggregated>) together.
 * Combines volume and tx counts for addresses seen in both.
 */
function mergeMaps(mapA, mapB) {
  const merged = new Map(mapA);
  for (const [addr, data] of mapB) {
    const existing = merged.get(addr) || { volumeUsd: 0, txCount: 0, lastBlock: 0 };
    merged.set(addr, {
      volumeUsd: existing.volumeUsd + data.volumeUsd,
      txCount:   existing.txCount   + data.txCount,
      lastBlock: Math.max(existing.lastBlock, data.lastBlock),
    });
  }
  return merged;
}

// ─────────────────────────────────────────────────────────────
//  PRICE ORACLE — DeFiLlama (free, no API key)
//  Used to convert raw token amounts → USD volume.
//  Falls back to 0 if the token isn't listed.
// ─────────────────────────────────────────────────────────────

async function fetchTokenPriceUsd(tokenAddress) {
  try {
    const url = `https://coins.llama.fi/prices/current/ethereum:${tokenAddress}`;
    const { data } = await axios.get(url, { timeout: 5_000 });
    const key   = `ethereum:${tokenAddress.toLowerCase()}`;
    const price = data?.coins?.[key]?.price ?? 0;
    console.log(`[price] ${tokenAddress} = $${price}`);
    return price;
  } catch (err) {
    console.warn(`[price] Failed to fetch price for ${tokenAddress}: ${err.message}`);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
//  PROVIDER 1 — ALCHEMY
//  Uses alchemy_getAssetTransfers to get ERC20 transfer history.
//  Aggregates per wallet: total token volume + tx count.
//  Volume = token amount × USD price (not metadata.value which is often null).
// ─────────────────────────────────────────────────────────────

async function fetchFromAlchemy(tokenAddress, priceUsd) {
  if (!ALCHEMY_KEY) { console.warn("[alchemy] No API key — skipping"); return new Map(); }

  console.log("[alchemy] Fetching ERC20 transfers...");

  const latestBlock = getCurrentBlock();
  const fromBlock   = "0x" + Math.max(0, latestBlock - LOOKBACK).toString(16);
  const rpcUrl      = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

  const { data } = await axios.post(
    rpcUrl,
    {
      id: 1, jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [{
        fromBlock,
        toBlock:           "latest",
        contractAddresses: [tokenAddress],
        category:          ["erc20"],
        withMetadata:      false,   // metadata.value is unreliable — we calculate USD ourselves
        excludeZeroValue:  true,
        maxCount:          "0x3E8", // 1000 transfers
      }],
    },
    { timeout: 15_000 }
  );

  if (data.error) throw new Error(`Alchemy RPC: ${data.error.message}`);

  const transfers = data?.result?.transfers || [];
  console.log(`[alchemy] ${transfers.length} transfers found`);

  const walletMap = new Map();
  for (const tx of transfers) {
    const addr   = tx.from?.toLowerCase();
    const amount = parseFloat(tx.value || 0);          // token amount (not USD)
    const usd    = amount * priceUsd;                  // ✅ correct USD calculation
    const block  = parseInt(tx.blockNum, 16) || 0;
    if (!addr || amount === 0) continue;

    const existing = walletMap.get(addr) || { volumeUsd: 0, txCount: 0, lastBlock: 0 };
    walletMap.set(addr, {
      volumeUsd: existing.volumeUsd + usd,
      txCount:   existing.txCount + 1,
      lastBlock: Math.max(existing.lastBlock, block),
    });
  }

  return walletMap;
}

// ─────────────────────────────────────────────────────────────
//  PROVIDER 2 — ETHERSCAN V2
//  Uses tokentx endpoint. Converts raw token units → USD.
// ─────────────────────────────────────────────────────────────

async function fetchFromEtherscan(tokenAddress, priceUsd) {
  if (!ETHERSCAN_KEY) { console.warn("[etherscan] No API key — skipping"); return new Map(); }

  console.log("[etherscan] Fetching token transfers...");

  const latestBlock = getCurrentBlock();
  const startBlock  = Math.max(0, latestBlock - LOOKBACK);

  const { data } = await axios.get("https://api.etherscan.io/v2/api", {
    params: {
      chainid:         1,
      module:          "account",
      action:          "tokentx",
      contractaddress: tokenAddress,
      startblock:      startBlock,
      endblock:        latestBlock,
      sort:            "desc",
      apikey:          ETHERSCAN_KEY,
    },
    timeout: 15_000,
  });

  if (data.status === "0") {
    if (data.message === "No transactions found") return new Map();
    throw new Error(`Etherscan: ${data.result}`);
  }

  const transfers = data.result || [];
  console.log(`[etherscan] ${transfers.length} transfers found`);

  const walletMap = new Map();
  for (const tx of transfers) {
    const addr     = tx.from?.toLowerCase();
    const decimals = parseInt(tx.tokenDecimal, 10) || 18;
    const amount   = parseFloat(tx.value) / 10 ** decimals;  // raw token amount
    const usd      = amount * priceUsd;                       // ✅ correct USD calculation
    const block    = parseInt(tx.blockNumber, 10) || 0;
    if (!addr || amount === 0) continue;

    const existing = walletMap.get(addr) || { volumeUsd: 0, txCount: 0, lastBlock: 0 };
    walletMap.set(addr, {
      volumeUsd: existing.volumeUsd + usd,
      txCount:   existing.txCount + 1,
      lastBlock: Math.max(existing.lastBlock, block),
    });
  }

  return walletMap;
}

// ─────────────────────────────────────────────────────────────
//  PROVIDER 3 — COVALENT (GoldRush)
//  Uses token holders endpoint for balance-based volume estimate.
// ─────────────────────────────────────────────────────────────

async function fetchFromCovalent(tokenAddress, priceUsd) {
  if (!COVALENT_KEY) { console.warn("[covalent] No API key — skipping"); return new Map(); }

  console.log("[covalent] Fetching token holders...");

  const url = `https://api.covalenthq.com/v1/eth-mainnet/tokens/${tokenAddress}/token_holders_v2/`;
  const response = await axios.get(url, {
    params: { "page-size": TOP_N * 2, "page-number": 0 },
    auth:   { username: COVALENT_KEY, password: "" },
    timeout: 10_000,
  });

  const items = response.data?.data?.items || [];
  console.log(`[covalent] ${items.length} holders found`);

  const walletMap = new Map();
  for (const holder of items) {
    const addr     = holder.address?.toLowerCase();
    const decimals = holder.contract_decimals || 18;
    const balance  = parseFloat(holder.balance || 0) / 10 ** decimals;
    const usd      = balance * priceUsd;
    if (!addr || balance === 0) continue;

    walletMap.set(addr, {
      volumeUsd: usd,
      txCount:   1,     // holders endpoint doesn't give tx count
      lastBlock: 0,
    });
  }

  return walletMap;
}

// ─────────────────────────────────────────────────────────────
//  MOCK DATA — last resort fallback
// ─────────────────────────────────────────────────────────────

const MOCK_WALLETS = [
  { address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", type: "whale",     volume_usd: 4823910.55, tx_count: 14, last_active_block: 19987231, score: 94.2, trend: "accumulating" },
  { address: "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", type: "whale",     volume_usd: 2940100.00, tx_count: 22, last_active_block: 19987100, score: 88.5, trend: "accumulating" },
  { address: "0x28c6c06298d514db089934071355e5743bf21d60", type: "recurring", volume_usd: 1204350.00, tx_count: 38, last_active_block: 19986950, score: 76.3, trend: "hot"          },
  { address: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", type: "recurring", volume_usd:  510780.25, tx_count:  9, last_active_block: 19987000, score: 61.0, trend: "neutral"      },
  { address: "0x21a31ee1afc51d94c2efccaa2092ad1028285549", type: "recurring", volume_usd:  389440.10, tx_count:  5, last_active_block: 19986830, score: 54.7, trend: "distributing" },
  { address: "0xae2d4617c862309a3d75a0ffb358c7a5009c673f", type: "new",       volume_usd:   87500.25, tx_count:  1, last_active_block: 19987450, score: 38.1, trend: "hot"          },
  { address: "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b", type: "new",       volume_usd:   45200.00, tx_count:  2, last_active_block: 19987320, score: 29.4, trend: "neutral"      },
  { address: "0xf977814e90da44bfa03b6295a0616a897441acec", type: "new",       volume_usd:   18750.80, tx_count:  1, last_active_block: 19987410, score: 21.6, trend: "dormant"      },
];

// ─────────────────────────────────────────────────────────────
//  MAIN EXPORT — fetchWalletIntelligence
//
//  Runs all available providers in parallel, merges results,
//  applies scoring + trend analysis, returns top N wallets.
//  Results are cached for CACHE_TTL_MS milliseconds.
// ─────────────────────────────────────────────────────────────

/**
 * @param {string} tokenAddress  - ERC20 contract address
 * @param {boolean} [forceRefresh=false] - Bypass cache
 * @returns {Promise<IntelligenceResponse>}
 */
export async function fetchWalletIntelligence(tokenAddress, forceRefresh = false) {
  const addr = tokenAddress.toLowerCase();

  // ── Cache check ─────────────────────────────────────────────
  if (!forceRefresh) {
    const cached = getCached(addr);
    if (cached) return cached;
  }

  // ── Fetch token price once — shared by all providers ────────
  const priceUsd = await fetchTokenPriceUsd(addr);
  console.log(`[intelligence] Token price: $${priceUsd}`);

  // ── Run all providers in parallel ───────────────────────────
  const [alchemyMap, etherscanMap, covalentMap] = await Promise.allSettled([
    fetchFromAlchemy(addr, priceUsd),
    fetchFromEtherscan(addr, priceUsd),
    fetchFromCovalent(addr, priceUsd),
  ]).then((results) =>
    results.map((r) => {
      if (r.status === "rejected") {
        console.warn(`[intelligence] Provider failed: ${r.reason?.message}`);
        return new Map();
      }
      return r.value;
    })
  );

  // ── Merge all provider data ──────────────────────────────────
  const merged = mergeMaps(mergeMaps(alchemyMap, etherscanMap), covalentMap);
  console.log(`[intelligence] Merged ${merged.size} unique wallets`);

  // ── No data from any provider — use mock ────────────────────
  if (merged.size === 0) {
    console.warn("[intelligence] All providers returned empty — using mock data");
    const mockResult = buildResult(MOCK_WALLETS, addr, priceUsd, "mock_fallback");
    return mockResult;
  }

  // ── Convert Map → array, classify, sort by volume ───────────
  const wallets = Array.from(merged.entries())
    .map(([address, { volumeUsd, txCount, lastBlock }]) => ({
      address,
      type:              classifyType(volumeUsd, txCount),
      volume_usd:        parseFloat(volumeUsd.toFixed(2)),
      tx_count:          txCount,
      last_active_block: lastBlock || null,
    }))
    .filter((w) => w.volume_usd > 0)                        // drop zero-volume wallets
    .sort((a, b) => b.volume_usd - a.volume_usd)            // sort by volume desc
    .slice(0, TOP_N);                                        // top 20–50 only

  console.log(`[intelligence] Top ${wallets.length} wallets selected`);

  // ── Score + trend enrich ─────────────────────────────────────
  const scored  = scoreAndRank(wallets);
  const trended = analyseTrends(scored);
  const enriched = trended.wallets; // wallets now have score + trend fields

  // ── Build final response ─────────────────────────────────────
  const result = buildResult(enriched, addr, priceUsd, "live");

  // ── Cache it ─────────────────────────────────────────────────
  setCache(addr, result);

  return result;
}

// ─────────────────────────────────────────────────────────────
//  RESPONSE BUILDER
// ─────────────────────────────────────────────────────────────

function buildResult(wallets, tokenAddress, priceUsd, source) {
  const totalVolumeUsd = parseFloat(
    wallets.reduce((sum, w) => sum + w.volume_usd, 0).toFixed(2)
  );

  const whaleCount     = wallets.filter((w) => w.type === "whale").length;
  const recurringCount = wallets.filter((w) => w.type === "recurring").length;
  const newCount       = wallets.filter((w) => w.type === "new").length;

  const scoring  = scoreSummary(wallets);
  const trends   = analyseTrends(wallets);

  return {
    token_address:    tokenAddress,
    token_price_usd:  priceUsd,
    data_source:      source,         // "live" | "mock_fallback"
    cached:           source === "live" ? false : undefined,
    top_wallets:      wallets,
    total_volume_usd: totalVolumeUsd,
    wallet_count:     wallets.length,
    breakdown: {
      whales:    whaleCount,
      recurring: recurringCount,
      new:       newCount,
    },
    insights: {
      market_signal:   trends.market_signal,    // "bullish" | "bearish" | "neutral"
      hot_wallets:     trends.hot_wallets,       // addresses active in last 1000 blocks
      avg_score:       scoring.avg_score,
      top_score:       scoring.top_score,
      score_dist:      scoring.score_distribution,
      trend_summary:   trends.summary,
    },
    scanned_blocks: parseInt(process.env.LOOKBACK_BLOCKS || "50000", 10),
    timestamp:      new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
//  HELPER EXPORTS for api.js
// ─────────────────────────────────────────────────────────────

export function getCacheStats() {
  const now = Date.now();
  return {
    entries: cache.size,
    keys: Array.from(cache.entries()).map(([k, v]) => ({
      token:      k,
      expires_in: Math.max(0, Math.round((v.expiresAt - now) / 1000)),
    })),
  };
}
