import { ActionData, ActionType, ExplorationState, InteractiveElement } from "../types/exploration";

export interface OptionContext {
  // recently visited URL fingerprints or raw URLs (normalized)
  recentUrls: string[];
  visitedUrls: Set<string>;
  clickedSelectorsOnPage: Set<string>;
}

export interface OptionPolicy {
  name: string;
  isApplicable(state: ExplorationState): boolean;
  // Heuristic expected utility (0..1) for picking this option now
  score(state: ExplorationState, ctx: OptionContext): number;
  // Produce a concrete action to execute
  propose(state: ExplorationState, ctx: OptionContext): ActionData | null;
}

function pick<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function textOk(t?: string): boolean {
  if (!t) return false;
  const s = t.trim();
  return s.length >= 2 && s.length <= 64;
}

export class NavigationOption implements OptionPolicy {
  name = "navigation";
  isApplicable(state: ExplorationState): boolean {
    return (state.domSnapshot?.links?.length || 0) > 0;
  }
  score(state: ExplorationState, ctx: OptionContext): number {
    const links = state.domSnapshot?.links || [];
    const fresh = links.filter(l => !ctx.visitedUrls.has(normalizeUrl(l.href)));
    return Math.min(1, fresh.length / Math.max(links.length, 1));
  }
  propose(state: ExplorationState, ctx: OptionContext): ActionData | null {
    const links = (state.domSnapshot?.links || [])
      .filter(l => l.href && !l.href.startsWith("#"));
    const candidates = links
      .filter(l => !ctx.visitedUrls.has(normalizeUrl(l.href)));
    const choice = pick(candidates.length ? candidates : links);
    if (!choice) return null;
    // find backing interactive element for selector/xpath mapping if possible
    const el = (state.domSnapshot.elements || []).find(e =>
      e.attributes && e.attributes.href === choice.href && textOk(choice.text)
    ) || (state.domSnapshot.elements || []).find(e => e.tagName === "a" && textOk(e.text));

    return {
      type: ActionType.CLICK,
      target: el,
      coordinates: el?.boundingBox ? { x: el.boundingBox.centerX, y: el.boundingBox.centerY } : undefined,
      timestamp: new Date(),
      duration: 0,
      success: true,
    };
  }
}

export class SearchOption implements OptionPolicy {
  name = "search";
  isApplicable(state: ExplorationState): boolean {
    return (state.domSnapshot?.inputs || []).some(i => (i.type || "text").toLowerCase().includes("search") || /search|find/i.test(i.placeholder || ""));
  }
  score(state: ExplorationState): number {
    return 0.6; // useful on many sites
  }
  propose(state: ExplorationState, _ctx: OptionContext): ActionData | null {
    const inputs = (state.domSnapshot?.inputs || []).filter(i => (i.type || "text").toLowerCase() === "search" || /search|find/i.test(i.placeholder || ""));
    const targetInput = pick(inputs);
    if (!targetInput) return null;
    const el = (state.domSnapshot.elements || []).find(e => e.id === targetInput.id || e.attributes["name"] === targetInput.name);
    const query = inferQueryFromContext(state) || "test";
    return {
      type: ActionType.TYPE,
      target: el,
      value: query,
      timestamp: new Date(),
      duration: 0,
      success: true,
    };
  }
}

export class FormFillOption implements OptionPolicy {
  name = "form_fill";
  isApplicable(state: ExplorationState): boolean {
    return (state.domSnapshot?.forms?.length || 0) > 0;
  }
  score(state: ExplorationState): number {
    return 0.7; // forms usually lead to new states
  }
  propose(state: ExplorationState, _ctx: OptionContext): ActionData | null {
    // Choose a text input to type into, else submit
    const forms = state.domSnapshot?.forms || [];
    const f = pick(forms);
    if (!f) return null;
    const input = (f.inputs || []).find(i => ["text", "email", "search"].includes((i.type || "text").toLowerCase()))
              || (f.inputs || [])[0];
    if (input) {
      const el = (state.domSnapshot.elements || []).find(e => e.id === input.id);
      return {
        type: ActionType.TYPE,
        target: el,
        value: guessValueForInput(input),
        timestamp: new Date(),
        duration: 0,
        success: true,
      };
    }
    // fallback: attempt submit button
    if (f.submitButton) {
      return {
        type: ActionType.CLICK,
        target: f.submitButton as unknown as InteractiveElement,
        coordinates: f.submitButton?.boundingBox ? { x: f.submitButton.boundingBox.centerX, y: f.submitButton.boundingBox.centerY } : undefined,
        timestamp: new Date(),
        duration: 0,
        success: true,
      };
    }
    return null;
  }
}

export class PaginationOption implements OptionPolicy {
  name = "pagination";
  isApplicable(state: ExplorationState): boolean {
    return (state.domSnapshot?.elements || []).some(e => /next|more|older|→|»/i.test(e.text || ""));
  }
  score(): number { return 0.4; }
  propose(state: ExplorationState, _ctx: OptionContext): ActionData | null {
    const candidate = (state.domSnapshot?.elements || []).find(e => /next|more|older|→|»/i.test(e.text || ""));
    if (!candidate) return null;
    return {
      type: ActionType.CLICK,
      target: candidate,
      coordinates: candidate.boundingBox ? { x: candidate.boundingBox.centerX, y: candidate.boundingBox.centerY } : undefined,
      timestamp: new Date(),
      duration: 0,
      success: true,
    };
  }
}

export class ScrollOption implements OptionPolicy {
  name = "scroll";
  isApplicable(): boolean { return true; }
  score(): number { return 0.2; }
  propose(_state: ExplorationState, _ctx: OptionContext): ActionData {
    return {
      type: ActionType.SCROLL,
      timestamp: new Date(),
      duration: 0,
      success: true,
      value: "down",
    } as any;
  }
}

export class LoginOption implements OptionPolicy {
  name = "login";
  isApplicable(state: ExplorationState): boolean {
    const inputs = state.domSnapshot?.inputs || [];
    const hasEmail = inputs.some(i => /email|user/i.test(i.type) || /email|user/i.test(i.name));
    const hasPassword = inputs.some(i => /password/i.test(i.type) || /pass/i.test(i.name));
    return hasEmail && hasPassword;
  }
  score(): number { return 0.8; }
  propose(state: ExplorationState, _ctx: OptionContext): ActionData | null {
    const inputs = state.domSnapshot?.inputs || [];
    const email = inputs.find(i => /email|user/i.test(i.type) || /email|user/i.test(i.name));
    const password = inputs.find(i => /password/i.test(i.type) || /pass/i.test(i.name));
    if (email) {
      const el = (state.domSnapshot.elements || []).find(e => e.id === email.id || e.attributes["name"] === email.name);
      return { type: ActionType.TYPE, target: el, value: "test@example.com", timestamp: new Date(), duration: 0, success: true } as any;
    }
    if (password) {
      const el = (state.domSnapshot.elements || []).find(e => e.id === password.id || e.attributes["name"] === password.name);
      return { type: ActionType.TYPE, target: el, value: "Password123!", timestamp: new Date(), duration: 0, success: true } as any;
    }
    return null;
  }
}

export class OpenInNewTabOption implements OptionPolicy {
  name = "open_new_tab";
  isApplicable(state: ExplorationState): boolean {
    return (state.domSnapshot?.elements || []).some(e => e.tagName === 'a');
  }
  score(): number { return 0.35; }
  propose(state: ExplorationState, ctx: OptionContext): ActionData | null {
    const els = (state.domSnapshot?.elements || []).filter(e => e.tagName === 'a');
    const unseen = els.filter(e => e.attributes?.href && !ctx.visitedUrls.has(normalizeUrl(e.attributes.href)));
    const target = pick(unseen.length ? unseen : els);
    if (!target) return null;
    return {
      type: ActionType.CLICK,
      target,
      modifiers: ['ctrl'],
      timestamp: new Date(),
      duration: 0,
      success: true,
    } as any;
  }
}

export class FilterSortOption implements OptionPolicy {
  name = "filter_sort";
  isApplicable(state: ExplorationState): boolean {
    return (state.domSnapshot?.elements || []).some(e => /filter|sort|refine/i.test(e.text || ''));
  }
  score(): number { return 0.45; }
  propose(state: ExplorationState, _ctx: OptionContext): ActionData | null {
    const candidate = (state.domSnapshot?.elements || []).find(e => /filter|sort|refine/i.test(e.text || ''));
    if (!candidate) return null;
    return { type: ActionType.CLICK, target: candidate, timestamp: new Date(), duration: 0, success: true } as any;
  }
}

// Helpers
function normalizeUrl(u: string): string {
  try { const url = new URL(u); return `${url.origin}${url.pathname}`; } catch { return u; }
}

function guessValueForInput(input: { type: string; name: string; placeholder?: string }): string {
  const t = (input.type || "text").toLowerCase();
  if (t === "email") return "test@example.com";
  if (/name/i.test(input.name)) return "Test User";
  if (/search|find/i.test(input.name) || /search/i.test(input.placeholder || "")) return "test";
  return "test";
}

function inferQueryFromContext(state: ExplorationState): string | null {
  const title = state.domSnapshot?.metadata?.title || "";
  if (/docs|api/i.test(title)) return "api";
  const path = new URL(state.url).pathname;
  const segs = path.split('/').filter(Boolean);
  return segs[0] || null;
}
