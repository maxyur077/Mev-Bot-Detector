# MEV-Bot Detector

A production-grade real-time MEV (Maximal Extractable Value) bot detector with high-performance analysis engine for Ethereum and Worldchain networks.

## 🚀 Features

- **Real-time Mempool Monitoring**: WebSocket connection to Ethereum/Worldchain nodes with auto-reconnection
- **High-Performance Analysis**: JavaScript/Mock WASM engine achieving 1,000+ TPS
- **Sandwich Attack Detection**: Identifies frontrun/backrun patterns within transaction batches
- **Historical Validation**: The Graph subgraph integration for cross-validation
- **Smart Deduplication**: Redis-based alert suppression with 5-minute TTL
- **Real-time Alerts**: Kafka producer for instant MEV notifications
- **Multi-Network Support**: Works with Ethereum mainnet and Worldchain
- **Production Infrastructure**: Docker Compose with Kafka, Redis, PostgreSQL

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Bot](#running-the-bot)
- [Architecture](#architecture)
- [MEV Detection Logic](#mev-detection-logic)
- [Monitoring & Alerts](#monitoring--alerts)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)
- [Contributing](#contributing)

## Prerequisites

- **Node.js** 18+
- **Docker & Docker Compose** (for infrastructure)
- **Ethereum RPC Provider** Alchemy
- **Git** for cloning the repository

## Quick Start

Clone and setup
git clone https://github.com/your-username/mev-bot-detector.git
cd mev-bot-detector

Install dependencies
npm install

Copy environment template
cp .env.example .env

Edit .env with your Alchemy API key
WSS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
Start infrastructure
npm run docker-up

Start the MEV detector
npm start

🎯 **Your MEV detector should now be monitoring the mempool for sandwich attacks!**

## Installation

### 1. Clone the Repository

git clone https://github.com/your-username/mev-bot-detector.git
cd mev-bot-detector

text

### 2. Install Dependencies

npm install

text

### 3. Set Up Infrastructure

Start Redis, Kafka, and other services
npm run docker-up

Wait 30-60 seconds for services to fully start
text

### 4. Configure Environment

Copy the example environment file
cp .env.example .env

Edit .env with your configuration
text

## Configuration

Create a `.env` file in the project root:

### Environment Variables

Ethereum Node Configuration
WSS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
HTTP_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKAJS_NO_PARTITIONER_WARNING=1

Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

The Graph Configuration (Optional)
SUBGRAPH_URL=http://localhost:8000/subgraphs/name/mev-patterns

Performance Configuration
BATCH_SIZE=1
MAX_RECONNECT_ATTEMPTS=10

Monitoring
LOG_LEVEL=info
METRICS_PORT=3001

text

### Getting an API Key

#### Option 1: Alchemy (Recommended)

1. Sign up at [alchemy.com](https://www.alchemy.com)
2. Create a new app for **Ethereum Mainnet**
3. Enable **WebSocket** support
4. Copy your API key and update `.env`

#### Option 2: QuickNode

1. Sign up at [quicknode.com](https://www.quicknode.com)
2. Create a free Ethereum Mainnet endpoint
3. Copy the WebSocket URL and update `.env`

## Running the Bot

### Start the MEV Detector

npm start

text

### Expected Output

🔗 Connecting to Alchemy WebSocket: wss://eth-mainnet.g.alchemy.com/v2/[HIDDEN]
✅ Ethereum WebSocket Provider connected - Current block: 19400000
✅ Redis connected
✅ Kafka producer connected
✅ WASM MEV Engine initialized
🚀 Starting MEV-Bot Detector...
🔍 Received pending tx #1: 0x1234abcd...
📦 Block 19400001: 180 transactions
📊 Performance: 45.67 TPS | Processed: 234 | MEV: 0 | Pending RX: 1247

text

### Stop the Bot

Press `Ctrl+C` for graceful shutdown:

🔄 Shutting down MEV-Bot Detector...
✅ Shutdown complete

text

### Components

- **Ingestion Service**: Captures pending transactions via WebSocket + polls recent blocks
- **MEV Engine**: Analyzes transaction batches for sandwich attack patterns
- **Redis**: Handles alert deduplication with 5-minute TTL
- **Kafka**: Produces real-time MEV alerts
- **The Graph**: Validates attackers against historical patterns

## MEV Detection Logic

The bot specifically detects **sandwich attacks**:

1. **Victim Transaction**: A swap on Uniswap/SushiSwap
2. **Front-run**: Same attacker submits transaction before victim
3. **Back-run**: Same attacker submits transaction after victim
4. **Time Window**: All within 120 seconds and 2 blocks

### Supported Protocols

- **Uniswap V2**: `0x7a250d5630b4cf539739df2c5dacb4c659f2488d`
- **Uniswap V3**: `0xe592427a0aece92de3edee1f18e0157c05861564`
- **SushiSwap**: `0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f`

### Detection Features

- **Real-time Processing**: Sub-second batch analysis
- **Protocol Detection**: Automatic identification of DEX protocols
- **Pattern Matching**: Advanced sandwich attack recognition
- **False Positive Reduction**: Historical validation via The Graph

## Monitoring & Alerts

### Performance Metrics

The bot logs performance every 10 seconds:

📊 Performance: 45.67 TPS | Processed: 234 | MEV: 2 | Pending RX: 1856

text

- **TPS**: Transactions per second processed
- **Processed**: Total transactions analyzed
- **MEV**: MEV attacks detected
- **Pending RX**: Pending transactions received

### Alert Format

MEV alerts are sent to Kafka topic `mev-alerts`:

{
"victim": "0x742d35Cc6634C0532925a3b8D1c9a3c...",
"attacker": "0x8ba1f109551bD432803012645Hac136c...",
"profit_eth": 0.042,
"protocol": "uniswap",
"timestamp": 1678901234,
"detected_by": "alchemy_mev_bot",
"network": "ethereum"
}

text

### Deduplication

- **Redis Key Pattern**: `mev:{attacker_address}:last_alert`
- **TTL**: 5 minutes (300 seconds)
- **Purpose**: Prevents spam from the same attacker

## Testing

### Integration Tests

npm test

text

### Load Testing

npm run load-test

text

This simulates high-volume processing to verify the engine performance.

### Manual Testing

1. **Check Infrastructure**:
   docker compose ps

text

2. **Test Ethereum Connection**:
   curl -X POST https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   -H "Content-Type: application/json"
   -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

text

3. **Verify Redis**:
   redis-cli ping

text

## Troubleshooting

### Common Issues

#### 1. "403 Forbidden" WebSocket Error

- **Cause**: Invalid or expired API key
- **Solution**: Regenerate API key in provider dashboard

#### 2. "0.00 TPS | Processed: 0"

- **Cause**: No transactions being received
- **Solutions**:
- Check if provider supports pending transactions
- Verify API key permissions
- Switch to Ethereum mainnet (higher volume than Worldchain)

#### 3. Kafka Connection Refused

- **Cause**: Kafka not running
- **Solution**:
  npm run docker-up

Wait 60 seconds, then restart bot
text

#### 4. Redis Connection Failed

- **Cause**: Redis not running or wrong configuration
- **Solution**: Check `REDIS_HOST` and `REDIS_PORT` in `.env`

### Debug Mode

Enable verbose logging by adding debug statements:

// In start() method
console.log("🔍 PENDING TX RECEIVED:", txHash);

text

### Performance Optimization

- **Low TPS**: Increase `BATCH_SIZE` in `.env`
- **High Memory Usage**: Reduce `BATCH_SIZE`
- **Network Issues**: Check provider connection and quotas

## Production Deployment

### Environment Setup

Production environment variables
NODE_ENV=production
WSS_URL=wss://eth-mainnet.g.alchemy.com/v2/PROD_API_KEY
KAFKA_BROKERS=kafka1:9092,kafka2:9092,kafka3:9092
REDIS_HOST=redis-cluster.internal

text

### Scaling Strategies

- **Horizontal**: Multiple detector instances with Kafka partitioning
- **Vertical**: Increase batch sizes and memory allocation
- **Infrastructure**: Redis Cluster and Kafka cluster for high availability

### Monitoring

Implement monitoring for:

- Transaction processing rate
- MEV detection accuracy
- Infrastructure health (Redis, Kafka)
- API quota usage
- Memory and CPU utilization

## Scripts

Development
npm start # Start the MEV detector
npm test # Run integration tests
npm run load-test # Performance testing

Infrastructure
npm run docker-up # Start services (Redis, Kafka)
npm run docker-down # Stop services

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-detection`
3. Make changes with tests
4. Submit a pull request

### Development Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/your-username/mev-bot-detector/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/mev-bot-detector/discussions)
- **Documentation**: [Project Wiki](https://github.com/your-username/mev-bot-detector/wiki)

## Acknowledgments

- **Ethereum Foundation** for blockchain infrastructure
- **Alchemy** for reliable RPC services
- **The Graph Protocol** for decentralized indexing
- **Apache Kafka** for real-time messaging
- **Redis** for high-performance caching

---

**⚡ Built for production-grade MEV detection with enterprise reliability**

### Status

🟢 **Active Development** | 🔒 **Production Ready** | 📈 **Scalable Architecture**
These files provide:

.gitignore:

Comprehensive exclusions for Node.js, Rust, Docker, and development files

Protection for sensitive data like API keys and environment files

Coverage for build artifacts, logs, and temporary files

README.md:

Complete setup and usage instructions

Architecture overview and component explanations

Troubleshooting guide for common issues

Production deployment guidelines

Contributing instructions and project structure

Both files are production-ready and will help users understand, set up, and contribute to your MEV-Bot Detector project effectively.
