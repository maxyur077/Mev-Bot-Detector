import MEVEngine from "../mev_engine/pkg/mev_engine.js";

class LoadTester {
  constructor() {
    this.engine = new MEVEngine();
  }

  generateTestTransaction(index, isAttacker = false, timestamp = Date.now()) {
    return {
      hash: `0x${index.toString(16).padStart(64, "0")}`,
      from: isAttacker ? "0xattacker123" : `0xuser${index}`,
      to: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      value: (Math.random() * 10 * 1e18).toString(),
      gasPrice: (20 * 1e9).toString(),
      gasLimit: "200000",
      data: "0x38ed1739",
      nonce: index,
      timestamp,
    };
  }

  generateTestBatch(size = 500) {
    const batch = [];
    const baseTimestamp = Date.now();

    for (let i = 0; i < size; i++) {
      if (Math.random() < 0.1 && i >= 2) {
        batch.push(
          this.generateTestTransaction(i - 2, true, baseTimestamp + i - 2)
        );
        batch.push(
          this.generateTestTransaction(i - 1, false, baseTimestamp + i - 1)
        );
        batch.push(this.generateTestTransaction(i, true, baseTimestamp + i));
        i += 2;
      } else {
        batch.push(this.generateTestTransaction(i, false, baseTimestamp + i));
      }
    }

    return batch;
  }

  async runLoadTest(targetTPS = 10000, durationSeconds = 60) {
    console.log(
      `🚀 Starting load test: ${targetTPS} TPS for ${durationSeconds} seconds`
    );

    const batchSize = 500;
    const batchesPerSecond = Math.ceil(targetTPS / batchSize);
    const totalBatches = batchesPerSecond * durationSeconds;

    console.log(
      `📊 Configuration: ${batchSize} tx/batch, ${batchesPerSecond} batches/sec, ${totalBatches} total batches`
    );

    let processedBatches = 0;
    let totalProcessingTime = 0;
    let detectedMEV = 0;
    let totalTransactions = 0;

    const startTime = Date.now();

    const processBatch = () => {
      const batch = this.generateTestBatch(batchSize);
      const batchStart = performance.now();

      const result = this.engine.detect_mev(JSON.stringify(batch));

      const batchEnd = performance.now();
      const processingTime = batchEnd - batchStart;

      totalProcessingTime += processingTime;
      processedBatches++;
      totalTransactions += batch.length;

      if (result) {
        detectedMEV++;
      }

      const currentTPS = (batch.length / (processingTime / 1000)).toFixed(0);

      if (processedBatches % 100 === 0) {
        console.log(
          `📈 Processed ${processedBatches} batches | Current TPS: ${currentTPS} | MEV detected: ${detectedMEV}`
        );
      }
    };

    const interval = setInterval(() => {
      for (let i = 0; i < batchesPerSecond; i++) {
        processBatch();
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);

      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000;
      const avgTPS = (totalTransactions / totalTime).toFixed(2);
      const avgProcessingTime = (
        totalProcessingTime / processedBatches
      ).toFixed(2);

      console.log("\n🎯 Load Test Results:");
      console.log(`├── Duration: ${totalTime.toFixed(2)} seconds`);
      console.log(
        `├── Total Transactions: ${totalTransactions.toLocaleString()}`
      );
      console.log(`├── Total Batches: ${processedBatches}`);
      console.log(`├── Average TPS: ${avgTPS}`);
      console.log(
        `├── Average Processing Time: ${avgProcessingTime}ms per batch`
      );
      console.log(`├── MEV Patterns Detected: ${detectedMEV}`);
      console.log(
        `└── Success Rate: ${((processedBatches / totalBatches) * 100).toFixed(
          2
        )}%`
      );

      if (parseFloat(avgTPS) >= 1000) {
        console.log("✅ WASM engine achieves required 1,000+ TPS!");
      } else {
        console.log("❌ WASM engine did not meet 1,000 TPS requirement");
      }
    }, durationSeconds * 1000);
  }

  wasmBenchmark() {
    console.log("🧪 Running WASM-only benchmark...");

    const iterations = 10000;
    const tps = this.engine.benchmark_detection
      ? this.engine.benchmark_detection(iterations)
      : "N/A (function not available)";

    console.log(`🔥 WASM Engine TPS: ${tps.toLocaleString()}`);
    return tps;
  }
}

const tester = new LoadTester();

tester.wasmBenchmark();

tester.runLoadTest(10000, 30).catch(console.error);
