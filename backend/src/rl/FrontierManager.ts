import { ExplorationState } from "../types/exploration";
import { StateEncoder } from "./StateEncoder";

interface FrontierEntry {
  url: string;
  domain: string;
  fingerprint: string;
  score: number;
  depth: number;
  discoveredAt: number;
  visits: number;
}

/**
 * Lightweight frontier/archive for Go-Explore style return-then-explore.
 * Adds novel states and picks promising, under-visited candidates to revisit.
 */
export class FrontierManager {
  private encoder = new StateEncoder(64);
  private entries: Map<string, FrontierEntry> = new Map();

  consider(state: ExplorationState, noveltyScore: number, depth: number): void {
    const fp = this.encoder.encode(state);
    if (!fp) return;
    const key = `${state.domain}:${fp}`;
    if (this.entries.has(key)) return;
    this.entries.set(key, {
      url: state.url,
      domain: state.domain,
      fingerprint: fp,
      score: noveltyScore,
      depth,
      discoveredAt: Date.now(),
      visits: 0,
    });
  }

  markVisited(stateOrUrl: ExplorationState | string): void {
    let url = typeof stateOrUrl === 'string' ? stateOrUrl : stateOrUrl.url;
    const domain = typeof stateOrUrl === 'string' ? safeDomain(url) : stateOrUrl.domain;
    const fp = typeof stateOrUrl === 'string' ? '' : this.encoder.encode(stateOrUrl);
    if (fp) {
      const key = `${domain}:${fp}`;
      const e = this.entries.get(key);
      if (e) e.visits += 1;
    } else {
      // fallback by url match
      for (const [k, e] of this.entries) {
        if (e.url === url) { e.visits += 1; break; }
      }
    }
  }

  nextCandidate(currentUrl: string, visitedUrls: Set<string>): string | null {
    // Prefer high novelty, low visits, different from current URL
    const candidates: FrontierEntry[] = [];
    for (const e of this.entries.values()) {
      if (normalize(e.url) !== normalize(currentUrl) && !visitedUrls.has(normalize(e.url))) {
        candidates.push(e);
      }
    }
    candidates.sort((a, b) => score(b) - score(a));
    return candidates.length ? candidates[0].url : null;
  }

  snapshot(): FrontierEntry[] {
    return Array.from(this.entries.values());
  }
}

function score(e: FrontierEntry): number {
  // novelty, recency, and under-visited bias
  const ageSec = (Date.now() - e.discoveredAt) / 1000;
  const recency = 1 / (1 + Math.exp((ageSec - 60) / 60)); // ~ fresh within a couple of minutes
  const underVisited = 1 / (1 + e.visits);
  return 0.6 * e.score + 0.2 * recency + 0.2 * underVisited;
}

function normalize(u: string): string {
  try { const url = new URL(u); return `${url.origin}${url.pathname}`; } catch { return u; }
}

function safeDomain(u: string): string {
  try { return new URL(u).hostname; } catch { return ''; }
}

