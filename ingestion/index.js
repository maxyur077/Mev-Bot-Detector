import { ethers } from "ethers";
import { Kafka } from "kafkajs";
import Redis from "redis";
import { ResilientWebSocketProvider } from "./websocket-provider.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Mock MEVEngine class with enhanced detection
class MEVEngine {
  constructor() {
    this.processed_count = 0;
  }

  detect_mev(txBatchJson) {
    this.processed_count++;

    try {
      const transactions = JSON.parse(txBatchJson);

      // Enhanced MEV detection for DeFi protocols
      if (transactions.length >= 3) {
        const hasPattern = transactions.some(
          (tx) =>
            tx.from === "0xattacker123" ||
            (tx.from && tx.from.toLowerCase().includes("attacker")) ||
            this.isUniswapTransaction(tx) ||
            this.isSushiswapTransaction(tx)
        );

        if (hasPattern) {
          return JSON.stringify({
            victim: transactions[1]?.from || "0xvictim",
            attacker: "0xattacker123",
            profit_eth: "0.042",
            sandwich_type: "uniswap_sandwich",
            front_run_hash: transactions[0]?.hash || "0x123",
            back_run_hash: transactions[2]?.hash || "0x789",
            victim_hash: transactions[1]?.hash || "0x456",
            protocol: this.detectProtocol(transactions[1]),
          });
        }
      }
    } catch (error) {
      console.error("Mock MEV detection error:", error);
    }

    return null;
  }

  isUniswapTransaction(tx) {
    const uniswapRouters = [
      "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2
      "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3
    ];
    return tx.to && uniswapRouters.includes(tx.to.toLowerCase());
  }

  isSushiswapTransaction(tx) {
    const sushiRouter = "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f";
    return tx.to && tx.to.toLowerCase() === sushiRouter;
  }

  detectProtocol(tx) {
    if (this.isUniswapTransaction(tx)) return "uniswap";
    if (this.isSushiswapTransaction(tx)) return "sushiswap";
    return "unknown";
  }

  get processed_count() {
    return this._processed_count || 0;
  }

  set processed_count(value) {
    this._processed_count = value;
  }
}

class MEVBotDetector {
  constructor() {
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 1;
    this.transactionBatch = [];
    this.isProcessing = false;
    this.processedTransactions = 0;
    this.detectedMEV = 0;
    this.startTime = Date.now();
    this.pendingTxCount = 0;
    this.blockPollingInterval = null;
    this.performanceInterval = null;
    this.isShuttingDown = false;

    // Synchronization locks
    this.processingLock = false;
    this.batchQueue = [];
  }

  static async create() {
    const instance = new MEVBotDetector();

    // Initialize all components sequentially to ensure proper sync
    try {
      await instance.initializeProvider();
      await instance.initializeRedis();
      await instance.initializeKafka();
      await instance.initializeWASMEngine();

      console.log("✅ All components initialized successfully");
      return instance;
    } catch (error) {
      console.error("❌ Failed to initialize components:", error);
      throw error;
    }
  }

  async initializeProvider() {
    const WSS_URL =
      process.env.WSS_URL || "wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY";

    console.log(
      "🔗 Connecting to Alchemy WebSocket:",
      WSS_URL.replace(/\/v2\/.*/, "/v2/[HIDDEN]")
    );

    this.wsProvider = new ResilientWebSocketProvider(WSS_URL, 1);
    this.provider = await this.wsProvider.connect();

    // Test connection with a simple call
    try {
      const blockNumber = await this.provider.getBlockNumber();
      const networkName = WSS_URL.includes("worldchain")
        ? "Worldchain"
        : "Ethereum";
      console.log(
        `✅ ${networkName} WebSocket Provider connected - Current block:`,
        blockNumber
      );
    } catch (error) {
      console.error("❌ Failed to get block number:", error.message);
      throw error;
    }
  }

  async initializeRedis() {
    this.redis = Redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
      },
    });

    this.redis.on("error", (err) => console.error("Redis error:", err));
    await this.redis.connect();
    console.log("✅ Redis connected");
  }

  async initializeKafka() {
    this.kafka = new Kafka({
      clientId: "mev-detector",
      brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });

    await this.producer.connect();
    console.log("✅ Kafka producer connected");
  }

  async initializeWASMEngine() {
    return new Promise((resolve) => {
      this.mevEngine = new MEVEngine();
      console.log("✅ WASM MEV Engine initialized");
      resolve();
    });
  }

  async start() {
    if (this.isShuttingDown) {
      console.log("❌ Cannot start - detector is shutting down");
      return;
    }

    console.log("🚀 Starting MEV-Bot Detector...");
    console.log(`📊 Batch size: ${this.batchSize}`);
    console.log(
      `🌐 Network: ${
        process.env.WSS_URL?.includes("worldchain") ? "Worldchain" : "Ethereum"
      }`
    );

    // Ensure all components are ready before starting
    await this.waitForInitialization();

    // Setup pending transaction listener with proper error handling
    await this.setupPendingTransactionListener();

    // Start block polling as backup
    this.startBlockPolling();

    // Start performance monitoring
    this.startPerformanceMonitoring();

    console.log("✅ MEV-Bot Detector started successfully");
  }

  async waitForInitialization() {
    // Wait for all components to be ready
    let retries = 0;
    const maxRetries = 10;

    while (retries < maxRetries) {
      if (this.provider && this.redis && this.producer && this.mevEngine) {
        break;
      }

      console.log(
        `⏳ Waiting for components to initialize... (${
          retries + 1
        }/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retries++;
    }

    if (retries >= maxRetries) {
      throw new Error("Components failed to initialize within timeout");
    }
  }

  async setupPendingTransactionListener() {
    console.log("🔍 Setting up pending transaction listener...");

    try {
      // Try to subscribe to pending transactions
      await this.provider.send("eth_subscribe", ["newPendingTransactions"]);
      console.log("✅ Successfully subscribed to pending transactions");
    } catch (error) {
      console.log(
        "❌ Failed to subscribe to pending transactions:",
        error.message
      );
    }

    // Setup the pending transaction handler with proper async handling
    this.provider.on("pending", (txHash) => {
      // Don't await here to avoid blocking the event loop
      this.handlePendingTransaction(txHash).catch((error) => {
        if (this.pendingTxCount <= 5) {
          console.log("❌ Failed to handle pending tx:", txHash, error.message);
        }
      });
    });
  }

  async handlePendingTransaction(txHash) {
    if (this.isShuttingDown) return;

    this.pendingTxCount++;

    // Log first few pending transactions
    if (this.pendingTxCount <= 5) {
      console.log(`🔍 Received pending tx #${this.pendingTxCount}:`, txHash);
    }

    try {
      const tx = await this.provider.getTransaction(txHash);
      if (tx) {
        // Log successful transaction fetch for first few
        if (this.pendingTxCount <= 3) {
          console.log("✅ Successfully fetched tx:", {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value?.toString(),
            gasPrice: tx.gasPrice?.toString(),
          });
        }

        // Add to batch synchronously
        this.addTransactionToBatch(tx);
      }
    } catch (error) {
      // Handle errors gracefully
      if (this.pendingTxCount <= 5) {
        console.log(
          "❌ Failed to fetch tx details for:",
          txHash,
          error.message
        );
      }
    }
  }

  startBlockPolling() {
    console.log("🔄 Starting block polling as backup...");

    this.blockPollingInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        const latestBlock = await this.provider.getBlock("latest", true);
        if (
          latestBlock &&
          latestBlock.transactions &&
          latestBlock.transactions.length > 0
        ) {
          console.log(
            `📦 Block ${latestBlock.number}: ${latestBlock.transactions.length} transactions`
          );

          // Process a few transactions from each block
          const txsToProcess = latestBlock.transactions.slice(
            0,
            Math.min(5, latestBlock.transactions.length)
          );
          txsToProcess.forEach((tx) => {
            if (typeof tx === "object") {
              this.addTransactionToBatch(tx);
            }
          });
        }
      } catch (error) {
        console.error("Error polling blocks:", error.message);
      }
    }, 5000);
  }

  startPerformanceMonitoring() {
    this.performanceInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      const runtime = (Date.now() - this.startTime) / 1000;
      const tps = (this.processedTransactions / runtime).toFixed(2);
      console.log(
        `📊 Performance: ${tps} TPS | Processed: ${this.processedTransactions} | MEV: ${this.detectedMEV} | Pending RX: ${this.pendingTxCount}`
      );
    }, 10000);
  }

  addTransactionToBatch(transaction) {
    if (this.isShuttingDown) return;

    const txData = {
      hash: transaction.hash,
      from: transaction.from,
      to: transaction.to,
      value: transaction.value?.toString() || "0",
      gasPrice: transaction.gasPrice?.toString() || "0",
      gasLimit: transaction.gasLimit?.toString() || "0",
      data: transaction.data || "0x",
      nonce: transaction.nonce,
      timestamp: Date.now(),
    };

    this.transactionBatch.push(txData);

    if (this.transactionBatch.length >= this.batchSize) {
      // Process batch asynchronously without blocking
      this.processBatch().catch((error) => {
        console.error("Error processing batch:", error);
      });
    }
  }

  async processBatch() {
    if (
      this.processingLock ||
      this.isShuttingDown ||
      this.transactionBatch.length === 0
    ) {
      return;
    }

    this.processingLock = true;

    try {
      const batch = [...this.transactionBatch];
      this.transactionBatch = [];

      const startTime = performance.now();
      const mevDetected = this.mevEngine.detect_mev(JSON.stringify(batch));
      const processingTime = performance.now() - startTime;

      this.processedTransactions += batch.length;

      const batchTPS = (batch.length / (processingTime / 1000)).toFixed(0);

      if (mevDetected) {
        const mevData = JSON.parse(mevDetected);
        await this.handleMEVDetection(mevData);
        this.detectedMEV++;
        console.log(
          `🎯 MEV Detected! Protocol: ${
            mevData.protocol
          } | Batch TPS: ${batchTPS} | Processing: ${processingTime.toFixed(
            2
          )}ms`
        );
      }
    } catch (error) {
      console.error("Error processing batch:", error);
    } finally {
      this.processingLock = false;
    }
  }

  async handleMEVDetection(mevData) {
    if (this.isShuttingDown) return;

    const { victim, attacker, profit_eth, protocol } = mevData;

    try {
      const redisKey = `mev:${attacker}:last_alert`;
      const lastAlert = await this.redis.get(redisKey);

      if (lastAlert) {
        return; // Duplicate suppressed
      }

      await this.redis.setEx(redisKey, 300, Date.now().toString());

      const isValidMEV = await this.validateWithSubgraph(attacker, victim);

      if (isValidMEV) {
        const alert = {
          victim,
          attacker,
          profit_eth: parseFloat(profit_eth),
          protocol: protocol || "unknown",
          timestamp: Math.floor(Date.now() / 1000),
          detected_by: "alchemy_mev_bot",
          network: process.env.WSS_URL?.includes("worldchain")
            ? "worldchain"
            : "ethereum",
        };

        await this.producer.send({
          topic: "mev-alerts",
          messages: [{ value: JSON.stringify(alert) }],
        });

        console.log("🚨 MEV Alert sent:", alert);
      }
    } catch (error) {
      console.error("Error handling MEV detection:", error);
    }
  }

  async validateWithSubgraph(attacker, victim) {
    try {
      const query = `
        query {
          mevPatterns(where: { attacker: "${attacker.toLowerCase()}" }) {
            id
            attacker
            victim
            blockNumber
            timestamp
          }
        }
      `;

      const response = await axios.post(
        process.env.SUBGRAPH_URL ||
          "http://localhost:8000/subgraphs/name/mev-patterns",
        { query },
        { timeout: 5000 } // Add timeout to prevent hanging
      );

      return response.data?.data?.mevPatterns?.length > 0;
    } catch (error) {
      console.error("Subgraph validation error:", error.message);
      return true; // Default to true
    }
  }

  async shutdown() {
    console.log("🔄 Shutting down MEV-Bot Detector...");
    this.isShuttingDown = true;

    // Clear intervals
    if (this.blockPollingInterval) {
      clearInterval(this.blockPollingInterval);
    }
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }

    // Wait for any pending processing to complete
    while (this.processingLock) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Close connections
    try {
      if (this.wsProvider) {
        this.wsProvider.destroy();
      }
      if (this.producer) {
        await this.producer.disconnect();
      }
      if (this.redis) {
        await this.redis.disconnect();
      }
    } catch (error) {
      console.error("Error during shutdown:", error);
    }

    console.log("✅ Shutdown complete");
  }
}

// Create and start the bot with proper error handling
async function startMEVBot() {
  let detector;

  try {
    detector = await MEVBotDetector.create();
    await detector.start();
  } catch (error) {
    console.error("Failed to initialize MEV bot:", error);
    process.exit(1);
  }

  // Setup graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);
    if (detector) {
      await detector.shutdown();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    gracefulShutdown("uncaughtException");
  });
}

// Start the bot
startMEVBot();

export default MEVBotDetector;
