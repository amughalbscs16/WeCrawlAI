import { ExplorationState } from "../types/exploration";
import { NoveltyEstimator } from "./NoveltyEstimator";
import { OptionContext, OptionPolicy, NavigationOption, FormFillOption, SearchOption, PaginationOption, ScrollOption, LoginOption, OpenInNewTabOption, FilterSortOption } from "./Options";

/**
 * Option-based scheduler combining extrinsic (heuristic) and intrinsic (novelty) utility.
 * Inspired by hierarchical RL / options framework and curiosity-driven exploration.
 */
export class OptionScheduler {
  private novelty: NoveltyEstimator;
  private options: OptionPolicy[];
  private epsilon: number;

  constructor(novelty: NoveltyEstimator, epsilon = 0.15) {
    this.novelty = novelty;
    this.epsilon = epsilon;
    this.options = [
      new NavigationOption(),
      new FormFillOption(),
      new SearchOption(),
      new PaginationOption(),
      new ScrollOption(),
      new LoginOption(),
      new OpenInNewTabOption(),
      new FilterSortOption(),
    ];
  }

  proposeAction(state: ExplorationState, ctx: OptionContext) {
    // Epsilon-greedy exploration over options
    if (Math.random() < this.epsilon) {
      const applicable = this.options.filter(o => o.isApplicable(state));
      if (applicable.length) {
        const rnd = applicable[Math.floor(Math.random() * applicable.length)];
        return rnd.propose(state, ctx);
      }
    }

    // Score options by simple linear combo: ext_score + intrinsic
    const intrinsic = this.novelty.intrinsicReward(state); // 0..1 decreasing with visits
    let bestScore = -Infinity;
    let bestAction: any = null;

    for (const opt of this.options) {
      if (!opt.isApplicable(state)) continue;
      const ext = clamp01(opt.score(state, ctx));
      const score = 0.7 * ext + 0.3 * intrinsic; // weights tuned conservatively
      if (score > bestScore) {
        bestScore = score;
        bestAction = opt.propose(state, ctx);
      }
    }

    return bestAction;
  }
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
