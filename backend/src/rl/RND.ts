import { FeatureExtractor } from "./FeatureExtractor";
import { ExplorationState } from "../types/exploration";

/**
 * Minimal Random Network Distillation (RND) implementation without deps.
 * - Target: fixed random linear projection + ReLU
 * - Predictor: trainable projection + ReLU, updated via simple SGD to minimize MSE
 * Intrinsic reward ~ mean squared error between predictor and target.
 */
export class RND {
  private feat: FeatureExtractor;
  private inDim: number;
  private outDim: number;
  private targetW: Float32Array; // outDim x inDim (row-major)
  private predW: Float32Array;   // outDim x inDim
  private lr: number;
  private enabled: boolean;

  constructor(opts?: { inDim?: number; outDim?: number; lr?: number; enabled?: boolean }) {
    this.inDim = opts?.inDim ?? 256;
    this.outDim = opts?.outDim ?? 64;
    this.lr = opts?.lr ?? 0.001;
    this.enabled = opts?.enabled ?? true;
    this.feat = new FeatureExtractor(this.inDim);
    this.targetW = this.randMat(this.outDim, this.inDim, 0.1);
    this.predW = this.randMat(this.outDim, this.inDim, 0.01);
  }

  intrinsic(state: ExplorationState, train = true): number {
    if (!this.enabled) return 0;
    const x = this.feat.extract(state); // inDim
    const t = this.forward(this.targetW, x); // outDim
    const p = this.forward(this.predW, x);   // outDim

    // MSE error
    let mse = 0;
    for (let i = 0; i < this.outDim; i++) {
      const d = p[i] - t[i];
      mse += d * d;
    }
    mse /= this.outDim;

    if (train) {
      // dL/dp = 2*(p - t)/outDim, ReLU backprop handled by forward storing mask? Use local recompute masks.
      const grad = new Float32Array(this.outDim);
      for (let i = 0; i < this.outDim; i++) grad[i] = (2 / this.outDim) * (p[i] - t[i]) * (p[i] > 0 ? 1 : 0);

      // SGD update predW: W -= lr * (grad outer x)
      const lr = this.lr;
      for (let i = 0; i < this.outDim; i++) {
        const gi = grad[i] * lr;
        for (let j = 0; j < this.inDim; j++) {
          const idx = i * this.inDim + j;
          this.predW[idx] -= gi * x[j];
        }
      }
    }
    return mse; // higher error => novel
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; }
  setLR(lr: number) { this.lr = lr; }

  private randMat(rows: number, cols: number, scale: number): Float32Array {
    const m = new Float32Array(rows * cols);
    for (let i = 0; i < m.length; i++) m[i] = (Math.random() * 2 - 1) * scale;
    return m;
  }

  private forward(W: Float32Array, x: Float32Array): Float32Array {
    const y = new Float32Array(this.outDim);
    for (let i = 0; i < this.outDim; i++) {
      let s = 0;
      const row = i * this.inDim;
      for (let j = 0; j < this.inDim; j++) s += W[row + j] * x[j];
      // ReLU
      y[i] = s > 0 ? s : 0;
    }
    return y;
  }
}

