# Smart Money Analytics API — Backend

Node.js + Express REST API for tracking top Ethereum wallets and analyzing ERC20 token activity. Supports multi-provider fallback: **Covalent → Alchemy → Etherscan**.

## Quick Start

```bash
npm install
cp .env.example .env    # Add your API keys
npm run dev             # Starts with --watch (auto-reload)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Production server (`node api.js`) |
| `npm run dev` | Dev server with auto-reload (`node --watch`) |

## Endpoint

```
GET /analytics/:tokenAddress
```

**Optional query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 50 | Max wallets returned |
| `minVolumeUsd` | 1000 | Minimum wallet USD volume |
| `blocks` | 50000 | Recent blocks to scan |
| `mock` | false | Return `example.json` without hitting APIs |

**Test with mock data (no API keys needed):**

```bash
curl "http://localhost:3001/analytics/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?mock=true"
```

## Environment Variables

```env
PORT=3001
COVALENT_API_KEY=your_key
ALCHEMY_API_KEY=your_key
ETHERSCAN_API_KEY=your_key
PROVIDER_ORDER=covalent,alchemy,etherscan
WHALE_VOLUME_THRESHOLD_USD=100000
LOOKBACK_BLOCKS=50000
```

## File Structure

```
backend/
├── api.js             # Express server, routes, middleware
├── dataProcessor.js   # Multi-provider fetch + wallet classification
├── example.json       # Mock response for testing
├── package.json
└── README.md
```
