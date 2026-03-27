// ============================================================
//  Smart Money Analytics API — api.js
//  Express server entry point
//
//  Run:   node api.js
//  Test:  curl http://localhost:3000/analytics/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
// ============================================================

import "dotenv/config";
import express    from "express";
import cors       from "cors";
import {
  getTopWallets,
  getProviderList,
  getClassificationConfig,
} from "./dataProcessor.js";

// ─────────────────────────────────────────────────────────────
//  SECTION 1: APP SETUP
// ─────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────

// CORS: allows the Next.js frontend (or any client) to call
// this API from a different origin (e.g. Vercel → Render).
// In production, replace "*" with your actual frontend URL:
//   origin: process.env.FRONTEND_URL || "https://your-app.vercel.app"
app.use(cors({
  origin:  process.env.FRONTEND_URL || "*",
  methods: ["GET"],
}));

// Parses incoming JSON request bodies (needed if you add POST routes later).
app.use(express.json());

// ── Request Logger ───────────────────────────────────────────
// Logs every incoming request with a timestamp, method, and path.
// Remove this middleware (or swap for morgan) in production.
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}]  ${req.method}  ${req.originalUrl}`);
  next();
});

// ─────────────────────────────────────────────────────────────
//  SECTION 2: HELPER — validate an Ethereum address
// ─────────────────────────────────────────────────────────────

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Returns true if `addr` is a valid Ethereum address.
 * @param {string} addr
 * @returns {boolean}
 */
function isValidEthAddress(addr) {
  return ETH_ADDRESS_REGEX.test(addr);
}

// ─────────────────────────────────────────────────────────────
//  SECTION 3: ROUTES
// ─────────────────────────────────────────────────────────────

// ── Health check ─────────────────────────────────────────────
/**
 * GET /
 * Quick ping to confirm the API is alive.
 * Useful for Render health checks and uptime monitors.
 */
app.get("/", (_req, res) => {
  res.json({
    status:  "ok",
    service: "Smart Money Analytics API",
    version: "1.0.0",
    endpoints: {
      analytics: "GET /analytics/:tokenAddress?provider=covalent",
      providers: "GET /providers",
      config:    "GET /config",
    },
  });
});

// ── List available providers ──────────────────────────────────
/**
 * GET /providers
 * Returns the list of supported data provider names.
 * Useful for the frontend to populate a provider selector.
 *
 * Example response:
 *   { "providers": ["covalent", "alchemy", "etherscan"] }
 */
app.get("/providers", (_req, res) => {
  res.json({ providers: getProviderList() });
});

// ── Classification config ─────────────────────────────────────
/**
 * GET /config
 * Exposes current wallet classification thresholds.
 * Lets the frontend show users what "whale" means in dollar terms.
 *
 * Example response:
 *   {
 *     "whale_usd_threshold":    100000,
 *     "recurring_tx_threshold": 3,
 *     "default_limit":          50,
 *     "default_blocks":         50000,
 *     "fallback_order":         ["covalent", "alchemy", "etherscan"]
 *   }
 */
app.get("/config", (_req, res) => {
  res.json(getClassificationConfig());
});

// ── Main analytics endpoint ───────────────────────────────────
/**
 * GET /analytics/:tokenAddress
 *
 * Fetches top wallet activity for a given ERC20 token.
 *
 * Path params:
 *   tokenAddress {string}  Ethereum ERC20 contract address (0x...)
 *
 * Query params (all optional):
 *   provider  {string}  "covalent" | "alchemy" | "etherscan" | "mock"
 *                       Defaults to "covalent".
 *   limit     {number}  Max wallets to return. Default: 50. Max: 200.
 *   blocks    {number}  Recent blocks to scan. Default: 50000.
 *
 * Example requests:
 *   /analytics/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
 *   /analytics/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?provider=alchemy
 *   /analytics/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?provider=mock
 *   /analytics/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?limit=10&blocks=10000
 *
 * Success response (200):
 *   {
 *     "token_address":    "0x...",
 *     "top_wallets":      [{ address, type, volume_usd, tx_count, last_active_block }],
 *     "total_volume_usd": 123456.78,
 *     "data_provider":    "covalent",
 *     "timestamp":        "2026-03-26T14:32:00.000Z"
 *   }
 */
app.get("/analytics/:tokenAddress", async (req, res) => {
  const { tokenAddress } = req.params;

  // ── 1. Validate token address ──────────────────────────────
  if (!isValidEthAddress(tokenAddress)) {
    return res.status(400).json({
      error:   "Invalid token address.",
      detail:  "Must be a 42-character Ethereum address starting with 0x.",
      example: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    });
  }

  // ── 2. Parse + validate query params ──────────────────────
  const VALID_PROVIDERS = [...getProviderList(), "mock"];

  const rawProvider = (req.query.provider || "covalent").toLowerCase().trim();
  const rawLimit    = parseInt(req.query.limit  || "50",    10);
  const rawBlocks   = parseInt(req.query.blocks || "50000", 10);

  // Reject unknown provider names early — avoids wasting a fetch attempt.
  if (!VALID_PROVIDERS.includes(rawProvider)) {
    return res.status(400).json({
      error:           "Unknown provider.",
      received:        rawProvider,
      valid_providers: VALID_PROVIDERS,
    });
  }

  if (isNaN(rawLimit) || rawLimit < 1 || rawLimit > 200) {
    return res.status(400).json({
      error:  "Invalid `limit` param.",
      detail: "Must be a number between 1 and 200.",
    });
  }

  if (isNaN(rawBlocks) || rawBlocks < 1000 || rawBlocks > 500_000) {
    return res.status(400).json({
      error:  "Invalid `blocks` param.",
      detail: "Must be a number between 1000 and 500000.",
    });
  }

  // ── 3. Call dataProcessor ──────────────────────────────────
  //
  //  PROVIDER FALLBACK CHAIN (handled inside dataProcessor.js):
  //
  //  ┌───────────┐  fail  ┌─────────┐  fail  ┌────────────┐  fail  ┌──────┐
  //  │ covalent  │───────▶│ alchemy │───────▶│ etherscan  │───────▶│ mock │
  //  └───────────┘        └─────────┘        └────────────┘        └──────┘
  //
  //  "fail" means any of:
  //    • Missing API key in .env
  //    • HTTP 429 rate-limit response
  //    • Network timeout (10–12s per provider)
  //    • Unexpected API error or malformed response
  //
  //  MOCK DATA is the final safety net — returned automatically
  //  when all live providers are exhausted. The response will
  //  include `"data_provider": "mock_fallback"` so the frontend
  //  can display a "using demo data" warning banner if desired.
  //
  try {
    const data = await getTopWallets(
      tokenAddress,
      rawProvider,
      { limit: rawLimit, blocks: rawBlocks }
    );

    return res.status(200).json(data);

  } catch (err) {

    // ── Token not found on-chain ─────────────────────────────
    // Hard error — no provider has data for this address.
    if (err.message?.includes("not found on-chain")) {
      return res.status(404).json({
        error:         "Token not found.",
        token_address: tokenAddress.toLowerCase(),
        detail:        "This address was not recognised as an ERC20 token on Ethereum mainnet.",
      });
    }

    // ── Invalid address from processor layer ─────────────────
    if (err.message?.includes("Invalid token address")) {
      return res.status(400).json({ error: err.message });
    }

    // ── Unexpected error ─────────────────────────────────────
    // Log the full stack server-side; send only a generic message
    // to the client — never expose internal error details.
    console.error("[/analytics] Unhandled error:", err.stack || err.message);

    return res.status(500).json({
      error:  "Internal server error.",
      detail: "An unexpected error occurred. Please try again shortly.",
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  SECTION 4: CATCH-ALL & GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────────────────────

// 404 — no route matched
app.use((req, res) => {
  res.status(404).json({
    error:     "Route not found.",
    requested: `${req.method} ${req.originalUrl}`,
    hint:      "Try: GET /analytics/:tokenAddress",
  });
});

// 500 — unhandled synchronous throw or middleware crash
// Note: 4-param signature is required for Express error handlers.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[global error handler]", err.stack || err.message);
  res.status(500).json({ error: "Unexpected server error." });
});

// ─────────────────────────────────────────────────────────────
//  SECTION 5: START SERVER
// ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("");
  console.log("  🧠  Smart Money Analytics API");
  console.log(`  Server running on port ${PORT}`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → http://localhost:${PORT}/analytics/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`);
  console.log("");
  console.log("  Provider fallback order:  covalent → alchemy → etherscan → mock");
  console.log(`  CORS origin:              ${process.env.FRONTEND_URL || "*"}`);
  console.log(`  Environment:              ${process.env.NODE_ENV     || "development"}`);
  console.log("");
});
