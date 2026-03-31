// ============================================================
//  Onchain Wallet Intelligence API — api.js
//
//  No provider selection — runs all providers automatically.
//  Results cached server-side to avoid rate limits.
//
//  Run:  node api.js
//  Dev:  node --watch api.js
// ============================================================

import "dotenv/config";
import express  from "express";
import cors     from "cors";
import {
  fetchWalletIntelligence,
  getCacheStats,
  clearCache,
} from "./dataProcessor.js";

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────────

app.use(cors({
  origin:  process.env.FRONTEND_URL || "*",
  methods: ["GET"],
}));

app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}]  ${req.method}  ${req.originalUrl}`);
  next();
});

// ─────────────────────────────────────────────────────────────
//  VALIDATION
// ─────────────────────────────────────────────────────────────

const ETH_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────

// ── Health check ─────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status:  "ok",
    service: "Onchain Wallet Intelligence API",
    version: "2.0.0",
    endpoints: {
      intelligence: "GET /intelligence/:tokenAddress",
      refresh:      "GET /intelligence/:tokenAddress/refresh",
      cache:        "GET /cache",
    },
  });
});

// ── Cache stats ───────────────────────────────────────────────
app.get("/cache", (_req, res) => {
  res.json(getCacheStats());
});

// ── Main intelligence endpoint ────────────────────────────────
/**
 * GET /intelligence/:tokenAddress
 *
 * Automatically fetches from all available providers (Alchemy,
 * Etherscan, Covalent), merges results, scores wallets, and
 * returns aggregated top 20–50 wallets with intelligence data.
 *
 * Results are cached for 10 minutes (configurable via CACHE_TTL_SECONDS).
 *
 * Response includes:
 *   top_wallets      — scored + trend-labelled wallet list
 *   total_volume_usd — aggregated USD volume across all wallets
 *   breakdown        — whale / recurring / new counts
 *   insights         — market signal, hot wallets, score distribution
 */
app.get("/intelligence/:tokenAddress", async (req, res) => {
  const { tokenAddress } = req.params;

  if (!ETH_ADDRESS.test(tokenAddress)) {
    return res.status(400).json({
      error:   "Invalid token address.",
      detail:  "Must be 0x followed by 40 hex characters.",
      example: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    });
  }

  try {
    const data = await fetchWalletIntelligence(tokenAddress, false);
    return res.json(data);
  } catch (err) {
    console.error("[/intelligence] Error:", err.message);
    return res.status(500).json({ error: "Failed to fetch wallet intelligence.", detail: err.message });
  }
});

// ── Force refresh — bypasses cache ───────────────────────────
/**
 * GET /intelligence/:tokenAddress/refresh
 *
 * Same as the main endpoint but bypasses the cache.
 * Use when you need fresh data immediately.
 * Will re-hit all providers and reset the cache TTL.
 */
app.get("/intelligence/:tokenAddress/refresh", async (req, res) => {
  const { tokenAddress } = req.params;

  if (!ETH_ADDRESS.test(tokenAddress)) {
    return res.status(400).json({ error: "Invalid token address." });
  }

  try {
    const data = await fetchWalletIntelligence(tokenAddress, true); // forceRefresh = true
    return res.json({ ...data, cache_refreshed: true });
  } catch (err) {
    console.error("[/refresh] Error:", err.message);
    return res.status(500).json({ error: "Failed to refresh wallet intelligence.", detail: err.message });
  }
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found.",
    hint:  "Try GET /intelligence/:tokenAddress",
  });
});

// ── Global error handler ──────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err.stack || err.message);
  res.status(500).json({ error: "Unexpected server error." });
});

// ─────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("");
  console.log("  🧠  Onchain Wallet Intelligence API  v2.0");
  console.log(`  Running  →  http://localhost:${PORT}`);
  console.log(`  Test     →  http://localhost:${PORT}/intelligence/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`);
  console.log("");
  console.log("  Providers:    Alchemy + Etherscan + Covalent (auto, parallel)");
  console.log("  Cache TTL:   ", process.env.CACHE_TTL_SECONDS || "600", "seconds");
  console.log("  Top wallets: ", process.env.TOP_WALLET_LIMIT  || "50");
  console.log(`  CORS origin:  ${process.env.FRONTEND_URL || "*"}`);
  console.log("");
});
