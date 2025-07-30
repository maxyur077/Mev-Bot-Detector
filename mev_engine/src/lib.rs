use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Transaction {
    hash: String,
    from: String,
    to: Option<String>,
    value: String,
    gas_price: Option<String>,
    gas_limit: Option<String>,
    data: Option<String>,
    nonce: Option<u64>,
    timestamp: u64,
}

#[derive(Serialize, Deserialize, Debug)]
struct MEVResult {
    victim: String,
    attacker: String,
    profit_eth: String,
    sandwich_type: String,
    front_run_hash: String,
    back_run_hash: String,
    victim_hash: String,
}

#[wasm_bindgen]
pub struct MEVEngine {
    uniswap_router: String,
    processed_count: u64,
}

#[wasm_bindgen]
impl MEVEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MEVEngine {
        MEVEngine {
            uniswap_router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D".to_lowercase(),
            processed_count: 0,
        }
    }

    #[wasm_bindgen]
    pub fn detect_mev(&mut self, tx_batch_json: &str) -> Option<String> {
        let transactions: Vec<Transaction> = match serde_json::from_str(tx_batch_json) {
            Ok(txs) => txs,
            Err(_) => return None,
        };

        self.processed_count += transactions.len() as u64;

        // High-performance MEV detection algorithm
        let mev_result = self.detect_sandwich_attacks(&transactions);
        
        match mev_result {
            Some(result) => {
                match serde_json::to_string(&result) {
                    Ok(json) => Some(json),
                    Err(_) => None,
                }
            },
            None => None,
        }
    }

    fn detect_sandwich_attacks(&self, transactions: &[Transaction]) -> Option<MEVResult> {
        let mut address_txs: HashMap<String, Vec<&Transaction>> = HashMap::new();
        let mut uniswap_swaps: Vec<&Transaction> = Vec::new();

        // Categorize transactions
        for tx in transactions {
            // Group by sender address
            address_txs.entry(tx.from.clone()).or_insert_with(Vec::new).push(tx);

            // Identify Uniswap swap transactions
            if let Some(ref to_addr) = tx.to {
                if to_addr.to_lowercase() == self.uniswap_router {
                    if let Some(ref data) = tx.data {
                        if self.is_swap_transaction(data) {
                            uniswap_swaps.push(tx);
                        }
                    }
                }
            }
        }

        // Look for sandwich patterns
        for victim_tx in &uniswap_swaps {
            if let Some(sandwich) = self.find_sandwich_pattern(victim_tx, &address_txs, transactions) {
                return Some(sandwich);
            }
        }

        None
    }

    fn is_swap_transaction(&self, data: &str) -> bool {
        if data.len() < 10 {
            return false;
        }
        
        let method_sig = &data[0..10];
        
        // Common Uniswap swap method signatures
        matches!(method_sig,
            "0x38ed1739" | // swapExactTokensForTokens
            "0x8803dbee" | // swapTokensForExactTokens
            "0x7ff36ab5" | // swapExactETHForTokens
            "0x18cbafe5" | // swapTokensForExactETH
            "0x791ac947" | // swapExactTokensForETH
            "0x4a25d94a"   // swapTokensForExactTokens
        )
    }

    fn find_sandwich_pattern(
        &self,
        victim_tx: &Transaction,
        address_txs: &HashMap<String, Vec<&Transaction>>,
        all_transactions: &[Transaction],
    ) -> Option<MEVResult> {
        let victim_timestamp = victim_tx.timestamp;
        let time_window = 120_000; // 120 seconds in milliseconds

        // Look for potential attackers with multiple transactions
        for (attacker_addr, attacker_txs) in address_txs {
            if attacker_addr == &victim_tx.from {
                continue; // Skip self
            }

            if attacker_txs.len() < 2 {
                continue; // Need at least front-run and back-run
            }

            // Find front-run and back-run transactions
            let mut front_run: Option<&Transaction> = None;
            let mut back_run: Option<&Transaction> = None;

            for tx in attacker_txs {
                let time_diff = if tx.timestamp > victim_timestamp {
                    tx.timestamp - victim_timestamp
                } else {
                    victim_timestamp - tx.timestamp
                };

                if time_diff <= time_window {
                    if let Some(ref to_addr) = tx.to {
                        if to_addr.to_lowercase() == self.uniswap_router {
                            if tx.timestamp < victim_timestamp && front_run.is_none() {
                                front_run = Some(tx);
                            } else if tx.timestamp > victim_timestamp && back_run.is_none() {
                                back_run = Some(tx);
                            }
                        }
                    }
                }
            }

            // If we found both front-run and back-run, it's likely a sandwich attack
            if let (Some(front), Some(back)) = (front_run, back_run) {
                let profit_eth = self.estimate_profit(front, victim_tx, back);
                
                return Some(MEVResult {
                    victim: victim_tx.from.clone(),
                    attacker: attacker_addr.clone(),
                    profit_eth: profit_eth.to_string(),
                    sandwich_type: "uniswap_sandwich".to_string(),
                    front_run_hash: front.hash.clone(),
                    back_run_hash: back.hash.clone(),
                    victim_hash: victim_tx.hash.clone(),
                });
            }
        }

        None
    }

    fn estimate_profit(
        &self,
        front_run: &Transaction,
        victim: &Transaction,
        back_run: &Transaction,
    ) -> f64 {
        // Simplified profit estimation based on gas prices and values
        let front_value = front_run.value.parse::<u128>().unwrap_or(0);
        let victim_value = victim.value.parse::<u128>().unwrap_or(0);
        let back_value = back_run.value.parse::<u128>().unwrap_or(0);

        // Calculate potential profit in ETH (simplified)
        let estimated_profit = (back_value as f64 - front_value as f64) / 1e18;
        
        // Consider victim transaction size as profit factor
        let victim_impact = (victim_value as f64 / 1e18) * 0.003; // ~0.3% slippage
        
        (estimated_profit + victim_impact).max(0.001) // Minimum detectable profit
    }

    #[wasm_bindgen(getter)]
    pub fn processed_count(&self) -> u64 {
        self.processed_count
    }
}

// Performance test function for load testing
#[wasm_bindgen]
pub fn benchmark_detection(iterations: u32) -> f64 {
    let start = js_sys::Date::now();
    
    let mut engine = MEVEngine::new();
    
    // Generate test data
    let test_batch = r#"[
        {
            "hash": "0x123",
            "from": "0xattacker",
            "to": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            "value": "1000000000000000000",
            "data": "0x38ed1739",
            "timestamp": 1678901234000
        },
        {
            "hash": "0x456",
            "from": "0xvictim",
            "to": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            "value": "5000000000000000000",
            "data": "0x38ed1739",
            "timestamp": 1678901235000
        },
        {
            "hash": "0x789",
            "from": "0xattacker",
            "to": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            "value": "2000000000000000000",
            "data": "0x38ed1739",
            "timestamp": 1678901236000
        }
    ]"#;

    for _ in 0..iterations {
        engine.detect_mev(test_batch);
    }

    let end = js_sys::Date::now();
    let duration_ms = end - start;
    
    // Return TPS
    (iterations as f64 * 3.0) / (duration_ms / 1000.0)
}
