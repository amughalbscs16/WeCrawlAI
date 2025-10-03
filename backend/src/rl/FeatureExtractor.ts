import { ExplorationState } from "../types/exploration";

/**
 * Simple hashed feature extractor from state signals.
 * Produces fixed-length numeric vector (Float32Array) for RND.
 */
export class FeatureExtractor {
  private dim: number;
  constructor(dim = 256) { this.dim = dim; }

  extract(state: ExplorationState): Float32Array {
    const v = new Float32Array(this.dim);

    const push = (s: string, w = 1) => {
      const idx = this.hash(s) % this.dim;
      v[idx] += w;
    };

    // URL tokens
    try {
      const u = new URL(state.url);
      push(`host:${u.hostname}`, 2);
      u.pathname.split('/').filter(Boolean).forEach(seg => push(`p:${seg}`, 1));
    } catch {}

    // Title and meta
    const title = state.domSnapshot?.metadata?.title || '';
    if (title) push(`title:${title.slice(0,64)}`, 2);

    // Elements (tags, roles, inputs)
    const els = state.domSnapshot?.elements || [];
    const n = Math.min(els.length, 200);
    for (let i = 0; i < n; i++) {
      const el = els[i];
      push(`t:${el.tagName}`, 1);
      if (el.role) push(`r:${el.role}`, 1);
      if (el.type) push(`ty:${el.type}`, 1);
      if (el.text) push(`tx:${el.text.slice(0,24)}`, 0.5);
    }

    // A11y landmarks/headings
    const a11y = state.accessibilityTree;
    if (a11y) {
      (a11y.landmarks || []).forEach(l => push(`lm:${l.role}`, 1));
      (a11y.headingStructure || []).forEach(h => push(`h:${h.level}`, 0.5));
    }

    // Normalize (L2)
    let sumSq = 0;
    for (let i = 0; i < this.dim; i++) sumSq += v[i]*v[i];
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < this.dim; i++) v[i] /= norm;
    return v;
  }

  private hash(s: string): number {
    // djb2
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return Math.abs(h | 0);
  }
}

