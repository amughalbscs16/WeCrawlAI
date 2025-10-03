import { ExplorationState } from "../types/exploration";

/**
 * Lightweight state encoder for web exploration.
 * Produces compact fingerprints for novelty/loop detection without ML deps.
 */
export class StateEncoder {
  private bits: number;

  constructor(bits: number = 64) {
    this.bits = bits;
  }

  /**
   * Encode an ExplorationState into a stable simhash-like fingerprint.
   * Uses URL tokens + pruned HTML + element types and texts (truncated).
   */
  encode(state: ExplorationState): string {
    const tokens: string[] = [];

    // URL tokens (path segments, domain parts)
    try {
      const url = new URL(state.url);
      tokens.push(url.hostname);
      tokens.push(...url.pathname.split("/").filter(Boolean));
      if (url.search) tokens.push(url.search.replace(/[?&=]/g, ":"));
    } catch {}

    // DOM element tags and short texts
    const elements = state.domSnapshot?.elements || [];
    for (let i = 0; i < Math.min(elements.length, 200); i++) {
      const el = elements[i];
      tokens.push(`t:${el.tagName}`);
      if (el.role) tokens.push(`r:${el.role}`);
      if (el.type) tokens.push(`ty:${el.type}`);
      if (el.text) tokens.push(`tx:${(el.text || "").slice(0, 24)}`);
    }

    // Pruned HTML summary
    const pruned = (state.domSnapshot?.prunedHtml || "")
      .replace(/\s+/g, " ")
      .slice(0, 4096);
    if (pruned) tokens.push(pruned);

    // Accessibility landmarks and headings
    const a11y = state.accessibilityTree;
    if (a11y) {
      tokens.push(...(a11y.landmarks || []).map(l => `lm:${l.role}`));
      tokens.push(...(a11y.headingStructure || []).map(h => `h${h.level}`));
    }

    return this.simhash(tokens.join("|"), this.bits);
  }

  /**
   * Simple simhash over string using 32-bit word hashing and bit voting.
   */
  private simhash(text: string, bits: number): string {
    const v = new Array<number>(bits).fill(0);
    const chunk = 8_192; // window to bound cost
    const str = text.length > chunk ? text.slice(0, chunk) : text;
    const tokens = str.split(/\|/);

    for (const t of tokens) {
      const h = this.hash32(t);
      for (let i = 0; i < bits; i++) {
        const bit = (h >>> (i % 32)) & 1;
        v[i] += bit ? 1 : -1;
      }
    }
    let out = 0n;
    for (let i = 0; i < bits; i++) {
      if (v[i] >= 0) out |= 1n << BigInt(i);
    }
    // return hex string of n-bits
    const hex = out.toString(16);
    const hexLen = Math.ceil(bits / 4);
    return hex.padStart(hexLen, "0");
  }

  private hash32(s: string): number {
    // FNV-1a 32-bit
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
}

