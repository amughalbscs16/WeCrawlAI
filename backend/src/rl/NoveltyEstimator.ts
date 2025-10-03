import { ExplorationState } from "../types/exploration";
import { StateEncoder } from "./StateEncoder";

/**
 * Count-based novelty estimator with hashing.
 * Intrinsic reward ~ 1/sqrt(1 + count(hash(state))).
 */
export class NoveltyEstimator {
  private counts: Map<string, number> = new Map();
  private encoder: StateEncoder;
  private bucketPrefix: string;

  constructor(bucketPrefix = "global") {
    this.encoder = new StateEncoder(64);
    this.bucketPrefix = bucketPrefix;
  }

  fingerprint(state: ExplorationState): string {
    return `${this.bucketPrefix}:${this.encoder.encode(state)}`;
  }

  intrinsicReward(state: ExplorationState): number {
    const fp = this.fingerprint(state);
    const c = this.counts.get(fp) || 0;
    return 1 / Math.sqrt(1 + c);
  }

  observe(state: ExplorationState): void {
    const fp = this.fingerprint(state);
    this.counts.set(fp, (this.counts.get(fp) || 0) + 1);
  }

  getCountsSnapshot(): Record<string, number> {
    return Object.fromEntries(this.counts.entries());
  }
}

