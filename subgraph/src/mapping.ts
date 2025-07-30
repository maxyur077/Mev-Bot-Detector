import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  Swap as SwapEvent,
  Transfer as TransferEvent,
} from "../generated/UniswapV2Router/UniswapV2Router";
import { MEVPattern, SandwichAttack } from "../generated/schema";

export function handleSwap(event: SwapEvent): void {
  // Track potential MEV patterns
  let patternId =
    event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let pattern = new MEVPattern(patternId);

  pattern.attacker = event.transaction.from;
  pattern.victim = event.params.to;
  pattern.frontRunTx = event.transaction.hash;
  pattern.backRunTx = Bytes.empty();
  pattern.victimTx = event.transaction.hash;
  pattern.blockNumber = event.block.number;
  pattern.timestamp = event.block.timestamp;
  pattern.profitETH = event.params.amount1Out.toBigDecimal();
  pattern.sandwichType = "uniswap_swap";

  pattern.save();

  // Update or create sandwich attack entity
  let attackerId = event.transaction.from.toHex();
  let sandwichAttack = SandwichAttack.load(attackerId);

  if (sandwichAttack == null) {
    sandwichAttack = new SandwichAttack(attackerId);
    sandwichAttack.attacker = event.transaction.from;
    sandwichAttack.victims = [];
    sandwichAttack.totalProfit = BigInt.fromI32(0).toBigDecimal();
    sandwichAttack.attackCount = BigInt.fromI32(0);
  }

  // Add victim to list if not already present
  let victims = sandwichAttack.victims;
  if (victims.indexOf(event.params.to) == -1) {
    victims.push(event.params.to);
    sandwichAttack.victims = victims;
  }

  sandwichAttack.totalProfit = sandwichAttack.totalProfit.plus(
    event.params.amount1Out.toBigDecimal()
  );
  sandwichAttack.attackCount = sandwichAttack.attackCount.plus(
    BigInt.fromI32(1)
  );
  sandwichAttack.lastAttackTimestamp = event.block.timestamp;

  sandwichAttack.save();

  log.info("MEV Pattern detected: {} at block {}", [
    patternId,
    event.block.number.toString(),
  ]);
}
