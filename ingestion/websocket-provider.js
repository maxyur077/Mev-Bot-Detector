import { WebSocketProvider as EthersWSProvider } from "ethers";
import WebSocket from "ws";

const EXPECTED_PONG_BACK = 15000;
const KEEP_ALIVE_CHECK_INTERVAL = 60000;

export class ResilientWebSocketProvider {
  constructor(url, network) {
    this.url = url;
    this.network = network;
    this.terminate = false;
    this.pingTimeout = null;
    this.keepAliveInterval = null;
    this.ws = null;
    this.provider = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.startConnection(resolve, reject);
    });
  }

  startConnection(resolve, reject) {
    this.ws = new WebSocket(this.url);

    this.ws.on("open", async () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;

      this.keepAliveInterval = setInterval(() => {
        if (!this.ws) return;

        this.ws.ping();

        this.pingTimeout = setTimeout(() => {
          if (this.ws) this.ws.terminate();
        }, EXPECTED_PONG_BACK);
      }, KEEP_ALIVE_CHECK_INTERVAL);

      this.provider = new EthersWSProvider(() => this.ws, this.network);

      while (this.ws?.readyState !== WebSocket.OPEN) {
        await this.sleep(100);
      }

      this.provider._start();

      while (!this.provider.ready) {
        await this.sleep(100);
      }

      if (resolve) resolve(this.provider);
    });

    this.ws.on("close", () => {
      console.error("WebSocket connection closed");
      if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
      if (this.pingTimeout) clearTimeout(this.pingTimeout);

      if (
        !this.terminate &&
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        this.reconnectAttempts++;
        setTimeout(() => this.startConnection(), 5000);
      }
    });

    this.ws.on("pong", () => {
      if (this.pingTimeout) clearTimeout(this.pingTimeout);
    });

    this.ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
      if (reject) reject(err);
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  destroy() {
    this.terminate = true;
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
    }
  }
}
