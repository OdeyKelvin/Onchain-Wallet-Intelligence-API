// ============================================================
//  Smart Money Analytics API — dataProcessor.js
//  Multi-provider ERC20 wallet analytics engine
//
//  Provider priority chain:
//    Covalent → Alchemy → Etherscan → Mock (last resort)
//
//  Usage:
//    import { getTopWallets } from "./dataProcessor.js";
//    const data = await getTopWallets("0xTokenAddress", "alchemy");
// ============================================================

import axios from "axios";

// ─────────────────────────────────────────────────────────────
//  SECTION 1: API KEY CONFIGURATION
//  ─────────────────────────────────────────────────────────────
//  Store all keys in a .env file at your project root.
//  Never commit real API keys to GitHub.
//
//  Your .env should look like:
//
//    COVALENT_API_KEY=your_covalent_key_here
//    ALCHEMY_API_KEY=your_alchemy_key_here
//    ETHERSCAN_API_KEY=your_etherscan_key_here
//
//  Get your keys here:
//    Covalent  → https://www.covalenthq.com/platform/
//    Alchemy   → https://dashboard.alchemy.com/
//    Etherscan → https://etherscan.io/myapikey
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  covalent: {
    apiKey:  process.env.COVALENT_API_KEY  || null,
    baseUrl: "https://api.covalenthq.com/v1",
    chain:   "eth-mainnet",
    //
    // ── EXTENDING TO MORE CHAINS ─────────────────────────────
    // Covalent supports 200+ chains. To switch chains,
    // change `chain` to any of:
    //   "matic-mainnet"       → Polygon
    //   "bsc-mainnet"         → BNB Chain
    //   "avalanche-mainnet"   → Avalanche
    //   "base-mainnet"        → Base
    //   "arbitrum-mainnet"    → Arbitrum One
    //
    // Or expose it via an env var:
    //   chain: process.env.COVALENT_CHAIN || "eth-mainnet"
    // ─────────────────────────────────────────────────────────
  },

  alchemy: {
    apiKey:  process.env.ALCHEMY_API_KEY   || null,
    baseUrl: "https://eth-mainnet.g.alchemy.com/v2",
    //
    // ── EXTENDING TO MORE CHAINS ─────────────────────────────
    // For other chains, swap the subdomain in baseUrl:
    //   "https://polygon-mainnet.g.alchemy.com/v2"  → Polygon
    //   "https://arb-mainnet.g.alchemy.com/v2"      → Arbitrum
    //   "https://base-mainnet.g.alchemy.com/v2"     → Base
    //   "https://opt-mainnet.g.alchemy.com/v2"      → Optimism
    //
    // Each chain requires its own Alchemy app + API key.
    // ─────────────────────────────────────────────────────────
  },

  etherscan: {
    apiKey:  process.env.ETHERSCAN_API_KEY || null,
    baseUrl: "https://api.etherscan.io/api",
    //
    // ── EXTENDING TO MORE CHAINS ─────────────────────────────
    // Etherscan has chain-specific API portals:
    //   "https://api.polygonscan.com/api"         → Polygon
    //   "https://api.bscscan.com/api"             → BNB Chain
    //   "https://api.arbiscan.io/api"             → Arbitrum
    //   "https://api.basescan.org/api"            → Base
    //   "https://api-optimistic.etherscan.io/api" → Optimism
    //
    // Each has its own separate API key.
    // ─────────────────────────────────────────────────────────
  },
};

// ─────────────────────────────────────────────────────────────
//  SECTION 2: WALLET CLASSIFICATION RULES
//  ─────────────────────────────────────────────────────────────
//  These thresholds determine how a wallet is labelled.
//  Tweak them or pull from env vars to adjust sensitivity.
//
//  To add a new type (e.g. "bot", "dao", "exchange"):
//    1. Add a new condition inside classifyWallet()
//    2. Return the new label string
//    3. Document it in your API schema
// ─────────────────────────────────────────────────────────────

const WHALE_USD_THRESHOLD    = parseFloat(process.env.WHALE_VOLUME_THRESHOLD_USD || "100000");
const RECURRING_TX_THRESHOLD = parseInt(process.env.RECURRING_TX_COUNT           || "3",    10);

/**
 * Classifies a wallet based on its trading behavior.
 *
 * @param {number} volumeUsd - Total USD volume transacted
 * @param {number} txCount   - Number of transactions in range
 * @returns {"whale"|"recurring"|"new"}
 */
function classifyWallet(volumeUsd, txCount) {
  if (volumeUsd >= WHALE_USD_THRESHOLD)    return "whale";
  if (txCount   >= RECURRING_TX_THRESHOLD) return "recurring";
  return "new";
}

// ─────────────────────────────────────────────────────────────
//  SECTION 3: PROVIDER — COVALENT
//  ─────────────────────────────────────────────────────────────
//  Uses the GoldRush (Covalent v2) token holders endpoint.
//  Returns paginated wallet balances with optional USD value.
//
//  Endpoint docs:
//  https://goldrush.dev/docs/api/balances/get-token-holders/
//
//  ── HOW TO ADD A NEW COVALENT ENDPOINT ────────────────────
//  Covalent exposes many other useful endpoints you could add
//  as additional exported functions, such as:
//    /v1/{chain}/tokens/{address}/token_holders_changes/
//    /v1/{chain}/address/{address}/portfolio_v2/
//  Just follow the same axios.get() pattern below.
// ─────────────────────────────────────────────────────────────

/**
 * @param {string} tokenAddress
 * @param {number} limit
 * @returns {Promise<NormalizedWallet[]>}
 */
async function fetchFromCovalent(tokenAddress, limit) {
  const { apiKey, baseUrl, chain } = CONFIG.covalent;
  if (!apiKey) throw new Error("COVALENT_API_KEY is not set in .env");

  console.log("[covalent] Fetching token holders...");

  const url = `${baseUrl}/${chain}/tokens/${tokenAddress}/token_holders_v2/`;
  const response = await axios.get(url, {
    params: { "page-size": limit, "page-number": 0 },
    auth:   { username: apiKey, password: "" }, // Covalent uses HTTP Basic Auth
    timeout: 10_000,
  });

  const items = response.data?.data?.items;
  if (!items || items.length === 0) throw new Error("TOKEN_NOT_FOUND");

  return items.slice(0, limit).map((holder) => {
    const decimals  = holder.contract_decimals || 18;
    const balance   = parseFloat(holder.balance) / 10 ** decimals;
    const priceUsd  = holder.quote_rate         || 0;
    const volumeUsd = balance * priceUsd;

    // Covalent holders endpoint doesn't expose tx count directly.
    // For tx count, pair with the /transactions_v3/ endpoint.
    const txCount = 1;

    return {
      address:           holder.address,
      type:              classifyWallet(volumeUsd, txCount),
      volume_usd:        parseFloat(volumeUsd.toFixed(2)),
      tx_count:          txCount,
      last_active_block: null,
    };
  });
}

// ─────────────────────────────────────────────────────────────
//  SECTION 4: PROVIDER — ALCHEMY
//  ─────────────────────────────────────────────────────────────
//  Uses alchemy_getAssetTransfers JSON-RPC method to stream
//  all ERC20 transfers for a given token contract, then
//  aggregates them per sending wallet.
//
//  Endpoint docs:
//  https://docs.alchemy.com/reference/alchemy-getassettransfers
//
//  ── HOW TO EXTEND WITH ALCHEMY ────────────────────────────
//  Alchemy exposes powerful enhanced APIs you could layer in:
//    alchemy_getTokenBalances  → balances for a wallet
//    alchemy_getTokenMetadata  → token symbol, decimals, logo
//    alchemy_getAssetTransfers (toAddress filter) → inbound only
//
//  For NFT analytics, swap category to ["erc721", "erc1155"].
// ─────────────────────────────────────────────────────────────

/**
 * @param {string} tokenAddress
 * @param {number} limit
 * @param {number} blocks - Number of recent blocks to scan
 * @returns {Promise<NormalizedWallet[]>}
 */
async function fetchFromAlchemy(tokenAddress, limit, blocks = 50_000) {
  const { apiKey, baseUrl } = CONFIG.alchemy;
  if (!apiKey) throw new Error("ALCHEMY_API_KEY is not set in .env");

  console.log("[alchemy] Fetching asset transfers...");

  const rpcUrl = `${baseUrl}/${apiKey}`;

  // Block range: current tip minus requested lookback
  // ~12 sec/block on Ethereum mainnet
  const approxLatestBlock = Math.floor(Date.now() / 12_000);
  const fromBlock = "0x" + Math.max(0, approxLatestBlock - blocks).toString(16);

  const { data } = await axios.post(
    rpcUrl,
    {
      id:      1,
      jsonrpc: "2.0",
      method:  "alchemy_getAssetTransfers",
      params: [{
        fromBlock:         fromBlock,
        toBlock:           "latest",
        contractAddresses: [tokenAddress],
        category:          ["erc20"],
        withMetadata:      true,
        excludeZeroValue:  true,
        maxCount:          "0x3E8", // 1000 transfers max
      }],
    },
    { timeout: 12_000 }
  );

  if (data.error) {
    if (data.error.code === -32602) throw new Error("TOKEN_NOT_FOUND");
    throw new Error(`Alchemy RPC error: ${data.error.message}`);
  }

  const transfers = data?.result?.transfers || [];
  if (transfers.length === 0) return [];

  // Aggregate per sender wallet
  const walletMap = new Map();

  for (const tx of transfers) {
    const addr     = tx.from?.toLowerCase();
    const valueUsd = parseFloat(tx.metadata?.value || 0);
    const block    = parseInt(tx.blockNum, 16);
    if (!addr) continue;

    const existing = walletMap.get(addr) || { volumeUsd: 0, txCount: 0, lastBlock: 0 };
    walletMap.set(addr, {
      volumeUsd: existing.volumeUsd + valueUsd,
      txCount:   existing.txCount   + 1,
      lastBlock: Math.max(existing.lastBlock, block),
    });
  }

  return Array.from(walletMap.entries())
    .sort(([, a], [, b]) => b.volumeUsd - a.volumeUsd)
    .slice(0, limit)
    .map(([address, { volumeUsd, txCount, lastBlock }]) => ({
      address,
      type:              classifyWallet(volumeUsd, txCount),
      volume_usd:        parseFloat(volumeUsd.toFixed(2)),
      tx_count:          txCount,
      last_active_block: lastBlock || null,
    }));
}

// ─────────────────────────────────────────────────────────────
//  SECTION 5: PROVIDER — ETHERSCAN
//  ─────────────────────────────────────────────────────────────
//  Uses the ERC20 token transfer event log endpoint.
//  Etherscan doesn't return USD prices natively — to add USD
//  values, pipe addresses through a price oracle like:
//    CoinGecko: https://api.coingecko.com/api/v3/simple/token_price/ethereum
//    DeFiLlama: https://coins.llama.fi/prices/current/ethereum:{tokenAddress}
//
//  Endpoint docs:
//  https://docs.etherscan.io/api-endpoints/accounts#get-a-list-of-erc20-token-transfer-events-by-address
//
//  ── HOW TO ADD USD PRICING ────────────────────────────────
//  After fetching transfers, call fetchTokenPriceUsd(tokenAddress)
//  and multiply each wallet's raw token volume by the result.
//  Wrap in try/catch so a price API failure doesn't kill the
//  analytics response — fall back to raw token units.
// ─────────────────────────────────────────────────────────────

/**
 * @param {string} tokenAddress
 * @param {number} limit
 * @param {number} blocks
 * @returns {Promise<NormalizedWallet[]>}
 */
async function fetchFromEtherscan(tokenAddress, limit, blocks = 50_000) {
  const { apiKey, baseUrl } = CONFIG.etherscan;
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY is not set in .env");

  console.log("[etherscan] Fetching token transfer logs...");

  const approxLatestBlock = Math.floor(Date.now() / 12_000);
  const startBlock        = Math.max(0, approxLatestBlock - blocks);

  const { data } = await axios.get(baseUrl, {
    params: {
      module:          "account",
      action:          "tokentx",
      contractaddress: tokenAddress,
      startblock:      startBlock,
      endblock:        approxLatestBlock,
      sort:            "desc",
      apikey:          apiKey,
    },
    timeout: 12_000,
  });

  if (data.status === "0") {
    if (data.message === "No transactions found") return [];
    if (data.message?.includes("Invalid"))        throw new Error("TOKEN_NOT_FOUND");
    throw new Error(`Etherscan error: ${data.result}`);
  }

  const transfers = data.result || [];
  const walletMap = new Map();

  for (const tx of transfers) {
    const addr     = tx.from?.toLowerCase();
    const decimals = parseInt(tx.tokenDecimal, 10) || 18;
    // Raw token units (no USD price from Etherscan — see note above)
    const volume   = parseFloat(tx.value) / 10 ** decimals;
    const block    = parseInt(tx.blockNumber, 10);
    if (!addr) continue;

    const existing = walletMap.get(addr) || { volumeUsd: 0, txCount: 0, lastBlock: 0 };
    walletMap.set(addr, {
      volumeUsd: existing.volumeUsd + volume,
      txCount:   existing.txCount   + 1,
      lastBlock: Math.max(existing.lastBlock, block),
    });
  }

  return Array.from(walletMap.entries())
    .sort(([, a], [, b]) => b.volumeUsd - a.volumeUsd)
    .slice(0, limit)
    .map(([address, { volumeUsd, txCount, lastBlock }]) => ({
      address,
      type:              classifyWallet(volumeUsd, txCount),
      volume_usd:        parseFloat(volumeUsd.toFixed(2)),
      tx_count:          txCount,
      last_active_block: lastBlock || null,
    }));
}

// ─────────────────────────────────────────────────────────────
//  SECTION 6: MOCK DATA FALLBACK
//  ─────────────────────────────────────────────────────────────
//  Used when ALL real providers fail (rate limits, missing keys,
//  network issues). Lets you develop / test the frontend
//  without burning API quota.
//
//  To use mock data intentionally, call:
//    getTopWallets("0x...", "mock")
//
//  ── HOW TO EXTEND MOCK DATA ───────────────────────────────
//  Add more entries to MOCK_WALLETS below to simulate different
//  distribution shapes (e.g. all-whales, no whales, sparse).
//  You can also load this from a local example.json file:
//    const MOCK_WALLETS = JSON.parse(fs.readFileSync("./example.json")).top_wallets;
// ─────────────────────────────────────────────────────────────

const MOCK_WALLETS = [
  { address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", type: "whale",     volume_usd: 4823910.55, tx_count: 14, last_active_block: 19987231 },
  { address: "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", type: "whale",     volume_usd: 2940100.00, tx_count: 22, last_active_block: 19987100 },
  { address: "0x28c6c06298d514db089934071355e5743bf21d60", type: "recurring", volume_usd: 1204350.00, tx_count: 38, last_active_block: 19986950 },
  { address: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", type: "recurring", volume_usd:  510780.25, tx_count:  9, last_active_block: 19987000 },
  { address: "0x21a31ee1afc51d94c2efccaa2092ad1028285549", type: "recurring", volume_usd:  389440.10, tx_count:  5, last_active_block: 19986830 },
  { address: "0xae2d4617c862309a3d75a0ffb358c7a5009c673f", type: "new",       volume_usd:   87500.25, tx_count:  1, last_active_block: 19987450 },
  { address: "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b", type: "new",       volume_usd:   45200.00, tx_count:  2, last_active_block: 19987320 },
  { address: "0xf977814e90da44bfa03b6295a0616a897441acec", type: "new",       volume_usd:   18750.80, tx_count:  1, last_active_block: 19987410 },
];

/** @returns {NormalizedWallet[]} */
function fetchFromMock() {
  console.warn("[mock] ⚠  Returning mock data — no live API providers available");
  return structuredClone(MOCK_WALLETS);
}

// ─────────────────────────────────────────────────────────────
//  SECTION 7: PROVIDER REGISTRY
//  ─────────────────────────────────────────────────────────────
//  Maps provider names → their fetch functions.
//
//  ── HOW TO ADD A NEW PROVIDER ─────────────────────────────
//  1. Write an async function fetchFromYourProvider(tokenAddress, limit, blocks)
//     that returns NormalizedWallet[]
//  2. Add it to this map: { yourprovider: fetchFromYourProvider }
//  3. Reference it in getTopWallets() or add to FALLBACK_ORDER
//
//  Example providers to add next:
//    Moralis   → https://docs.moralis.io/web3-data-api/evm/reference
//    DeFiLlama → https://defillama.com/docs/api
//    QuickNode → https://www.quicknode.com/docs
//    Infura    → https://docs.infura.io/api
// ─────────────────────────────────────────────────────────────

const PROVIDER_MAP = {
  covalent:  fetchFromCovalent,
  alchemy:   fetchFromAlchemy,
  etherscan: fetchFromEtherscan,
  mock:      fetchFromMock,
};

// Default fallback sequence when no provider is specified.
// Reorder to change priority. Remove entries to disable.
const FALLBACK_ORDER = ["covalent", "alchemy", "etherscan"];

// ─────────────────────────────────────────────────────────────
//  SECTION 8: RESPONSE BUILDER
// ─────────────────────────────────────────────────────────────

const DEFAULT_LIMIT      = parseInt(process.env.TOP_WALLET_LIMIT || "50",    10);
const DEFAULT_BLOCKS     = parseInt(process.env.LOOKBACK_BLOCKS  || "50000", 10);
const DEFAULT_MIN_VOLUME = parseFloat(process.env.MIN_VOLUME_USD || "0");

/**
 * Normalizes a raw wallet list into the standard API response shape.
 *
 * @param {NormalizedWallet[]} wallets
 * @param {string}             provider
 * @param {string}             tokenAddress
 * @returns {AnalyticsResponse}
 */
function buildResponse(wallets, provider, tokenAddress) {
  const filtered       = wallets.filter((w) => w.volume_usd >= DEFAULT_MIN_VOLUME);
  const totalVolumeUsd = parseFloat(
    filtered.reduce((sum, w) => sum + w.volume_usd, 0).toFixed(2)
  );

  return {
    token_address:    tokenAddress.toLowerCase(),
    top_wallets:      filtered,
    total_volume_usd: totalVolumeUsd,
    data_provider:    provider,
    timestamp:        new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
//  SECTION 9: MAIN EXPORTED FUNCTION
//  ─────────────────────────────────────────────────────────────

/**
 * Fetches top wallets for a given ERC20 token address.
 *
 * Behavior:
 *  - If `provider` is specified, tries that provider first, then falls back.
 *  - If `provider` is "mock", returns static mock data immediately.
 *  - If all live providers fail, returns mock data as the final fallback.
 *
 * @param {string}  tokenAddress - Ethereum ERC20 contract address (0x...)
 * @param {string}  [provider]   - "covalent" | "alchemy" | "etherscan" | "mock"
 * @param {object}  [options]
 * @param {number}  [options.limit=50]     - Max wallets returned
 * @param {number}  [options.blocks=50000] - Recent blocks to scan
 * @returns {Promise<AnalyticsResponse>}
 *
 * @example
 * // Default provider (covalent) with automatic fallback
 * const data = await getTopWallets("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
 *
 * @example
 * // Force a specific provider
 * const data = await getTopWallets("0xA0b...", "alchemy");
 *
 * @example
 * // Return mock data without hitting any API
 * const data = await getTopWallets("0xA0b...", "mock");
 */
export async function getTopWallets(
  tokenAddress,
  provider = "covalent",
  { limit = DEFAULT_LIMIT, blocks = DEFAULT_BLOCKS } = {}
) {
  // ── Validate address ────────────────────────────────────────
  const ETH_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
  if (!ETH_ADDRESS.test(tokenAddress)) {
    throw new Error(`Invalid token address: "${tokenAddress}". Must be 0x + 40 hex chars.`);
  }

  // ── Mock shortcut ────────────────────────────────────────────
  if (provider === "mock") {
    const wallets = fetchFromMock();
    return buildResponse(wallets, "mock", tokenAddress);
  }

  // ── Build ordered provider attempt list ─────────────────────
  // Put the requested provider first, then continue with the
  // remaining fallbacks in their default order.
  const attemptOrder = [
    provider,
    ...FALLBACK_ORDER.filter((p) => p !== provider),
  ];

  let lastError = null;

  for (const providerName of attemptOrder) {
    const fetchFn = PROVIDER_MAP[providerName];

    if (!fetchFn) {
      console.warn(`[getTopWallets] Unknown provider "${providerName}" — skipping`);
      continue;
    }

    try {
      const rawWallets = await fetchFn(tokenAddress, limit, blocks);
      console.log(`[getTopWallets] ✓ ${providerName} returned ${rawWallets.length} wallets`);
      return buildResponse(rawWallets, providerName, tokenAddress);

    } catch (err) {
      // Hard stop: token doesn't exist anywhere — no point retrying
      if (err.message === "TOKEN_NOT_FOUND") {
        throw new Error(`Token ${tokenAddress} was not found on-chain.`);
      }

      console.warn(`[getTopWallets] ✗ ${providerName} failed: ${err.message}`);
      lastError = err;
      // Continue to next provider
    }
  }

  // ── All live providers exhausted — use mock as last resort ──
  console.error(`[getTopWallets] All providers failed. Last error: ${lastError?.message}`);
  console.warn("[getTopWallets] Falling back to mock data");

  const wallets = fetchFromMock();
  return buildResponse(wallets, "mock_fallback", tokenAddress);
}

// ─────────────────────────────────────────────────────────────
//  SECTION 10: ADDITIONAL EXPORTS
//  ─────────────────────────────────────────────────────────────
//  Export lower-level helpers so api.js (or tests) can call
//  individual providers directly if needed.
//
//  Example usage in api.js:
//    import { getTopWallets, getProviderList } from "./dataProcessor.js";
//    app.get("/providers", (_req, res) => res.json(getProviderList()));
// ─────────────────────────────────────────────────────────────

/** Returns the list of registered provider names (excluding mock). */
export function getProviderList() {
  return Object.keys(PROVIDER_MAP).filter((p) => p !== "mock");
}

/** Returns current classification thresholds (useful for a /config API route). */
export function getClassificationConfig() {
  return {
    whale_usd_threshold:    WHALE_USD_THRESHOLD,
    recurring_tx_threshold: RECURRING_TX_THRESHOLD,
    default_limit:          DEFAULT_LIMIT,
    default_blocks:         DEFAULT_BLOCKS,
    fallback_order:         FALLBACK_ORDER,
  };
}

// ─────────────────────────────────────────────────────────────
//  TYPE DEFINITIONS (JSDoc — no TypeScript compiler needed)
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} NormalizedWallet
 * @property {string}                    address
 * @property {"whale"|"recurring"|"new"} type
 * @property {number}                    volume_usd
 * @property {number}                    tx_count
 * @property {number|null}               last_active_block
 */

/**
 * @typedef {object} AnalyticsResponse
 * @property {string}             token_address
 * @property {NormalizedWallet[]} top_wallets
 * @property {number}             total_volume_usd
 * @property {string}             data_provider
 * @property {string}             timestamp
 */
