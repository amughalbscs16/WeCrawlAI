import fs from 'fs/promises';
import path from 'path';

interface CostRecord {
  date: string;
  model: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
  };
  action: string;
}

interface LifetimeStats {
  totalCost: number;
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
  totalRequests: number;
  firstUsageDate: string;
  lastUpdated: string;
  costByModel: { [key: string]: number };
  costByDay: { [key: string]: number };
  costByMonth: { [key: string]: number };
  requestsByModel: { [key: string]: number };
}

class CostTracker {
  private lifetimeStatsPath: string;
  private dailyCostsPath: string;

  constructor() {
    this.lifetimeStatsPath = path.join(process.cwd(), 'lifetime_costs.json');
    this.dailyCostsPath = path.join(process.cwd(), 'daily_costs.json');
    this.initializeFiles();
  }

  private async initializeFiles(): Promise<void> {
    // Initialize lifetime stats file
    try {
      await fs.access(this.lifetimeStatsPath);
    } catch {
      const initialStats: LifetimeStats = {
        totalCost: 0,
        totalTokens: {
          input: 0,
          output: 0,
          total: 0
        },
        totalRequests: 0,
        firstUsageDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        costByModel: {},
        costByDay: {},
        costByMonth: {},
        requestsByModel: {}
      };

      await fs.writeFile(this.lifetimeStatsPath, JSON.stringify(initialStats, null, 2), 'utf8');
      console.log(`Initialized lifetime costs file at: ${this.lifetimeStatsPath}`);
    }

    // Initialize daily costs file
    try {
      await fs.access(this.dailyCostsPath);
    } catch {
      await fs.writeFile(this.dailyCostsPath, JSON.stringify([], null, 2), 'utf8');
      console.log(`Initialized daily costs file at: ${this.dailyCostsPath}`);
    }
  }

  /**
   * Add a cost record and update lifetime statistics
   */
  async addCost(
    model: string,
    cost: number,
    inputTokens: number,
    outputTokens: number,
    action: string
  ): Promise<void> {
    try {
      // Read current lifetime stats
      const stats = await this.getLifetimeStats();

      // Update total costs
      stats.totalCost += cost;
      stats.totalTokens.input += inputTokens;
      stats.totalTokens.output += outputTokens;
      stats.totalTokens.total += (inputTokens + outputTokens);
      stats.totalRequests += 1;
      stats.lastUpdated = new Date().toISOString();

      // Update cost by model
      if (!stats.costByModel[model]) {
        stats.costByModel[model] = 0;
        stats.requestsByModel[model] = 0;
      }
      stats.costByModel[model] += cost;
      stats.requestsByModel[model] += 1;

      // Update cost by day
      const today = new Date().toISOString().split('T')[0];
      if (!stats.costByDay[today]) {
        stats.costByDay[today] = 0;
      }
      stats.costByDay[today] += cost;

      // Update cost by month
      const month = new Date().toISOString().substring(0, 7);
      if (!stats.costByMonth[month]) {
        stats.costByMonth[month] = 0;
      }
      stats.costByMonth[month] += cost;

      // Save updated stats
      await fs.writeFile(this.lifetimeStatsPath, JSON.stringify(stats, null, 2), 'utf8');

      // Add to daily records
      const record: CostRecord = {
        date: new Date().toISOString(),
        model,
        cost,
        tokens: {
          input: inputTokens,
          output: outputTokens
        },
        action
      };

      const dailyRecords = await this.getDailyCosts();
      dailyRecords.push(record);

      // Keep only last 10000 records
      if (dailyRecords.length > 10000) {
        dailyRecords.splice(0, dailyRecords.length - 10000);
      }

      await fs.writeFile(this.dailyCostsPath, JSON.stringify(dailyRecords, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to update cost tracking:', error);
    }
  }

  /**
   * Get lifetime statistics
   */
  async getLifetimeStats(): Promise<LifetimeStats> {
    try {
      const data = await fs.readFile(this.lifetimeStatsPath, 'utf8');
      return JSON.parse(data);
    } catch {
      // Return default if file doesn't exist
      return {
        totalCost: 0,
        totalTokens: {
          input: 0,
          output: 0,
          total: 0
        },
        totalRequests: 0,
        firstUsageDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        costByModel: {},
        costByDay: {},
        costByMonth: {},
        requestsByModel: {}
      };
    }
  }

  /**
   * Get daily cost records
   */
  async getDailyCosts(limit?: number): Promise<CostRecord[]> {
    try {
      const data = await fs.readFile(this.dailyCostsPath, 'utf8');
      const records = JSON.parse(data);
      return limit ? records.slice(-limit) : records;
    } catch {
      return [];
    }
  }

  /**
   * Get cost for a specific date range
   */
  async getCostForDateRange(startDate: string, endDate: string): Promise<number> {
    const records = await this.getDailyCosts();
    const start = new Date(startDate);
    const end = new Date(endDate);

    return records
      .filter(r => {
        const recordDate = new Date(r.date);
        return recordDate >= start && recordDate <= end;
      })
      .reduce((sum, r) => sum + r.cost, 0);
  }

  /**
   * Get today's cost
   */
  async getTodayCost(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const stats = await this.getLifetimeStats();
    return stats.costByDay[today] || 0;
  }

  /**
   * Get this month's cost
   */
  async getMonthCost(): Promise<number> {
    const month = new Date().toISOString().substring(0, 7);
    const stats = await this.getLifetimeStats();
    return stats.costByMonth[month] || 0;
  }

  /**
   * Format cost display
   */
  formatCostSummary(stats: LifetimeStats): string {
    const daysSinceStart = Math.ceil(
      (new Date().getTime() - new Date(stats.firstUsageDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const avgDailyCost = stats.totalCost / daysSinceStart;

    return `
=== LIFETIME OPENAI API USAGE ===
Total Cost: $${stats.totalCost.toFixed(6)}
Total Requests: ${stats.totalRequests.toLocaleString()}
Total Tokens: ${stats.totalTokens.total.toLocaleString()}
  - Input: ${stats.totalTokens.input.toLocaleString()}
  - Output: ${stats.totalTokens.output.toLocaleString()}

First Usage: ${new Date(stats.firstUsageDate).toLocaleDateString()}
Days Active: ${daysSinceStart}
Average Daily Cost: $${avgDailyCost.toFixed(6)}

=== COST BY MODEL ===
${Object.entries(stats.costByModel)
  .sort(([, a], [, b]) => b - a)
  .map(([model, cost]) => `${model}: $${cost.toFixed(6)} (${stats.requestsByModel[model]} requests)`)
  .join('\n')}

=== RECENT DAILY COSTS ===
${Object.entries(stats.costByDay)
  .slice(-7)
  .map(([date, cost]) => `${date}: $${cost.toFixed(6)}`)
  .join('\n')}

=== MONTHLY COSTS ===
${Object.entries(stats.costByMonth)
  .map(([month, cost]) => `${month}: $${cost.toFixed(6)}`)
  .join('\n')}

Last Updated: ${new Date(stats.lastUpdated).toLocaleString()}
    `;
  }

  /**
   * Reset statistics (with backup)
   */
  async resetStats(backup = true): Promise<void> {
    if (backup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(process.cwd(), `lifetime_costs_backup_${timestamp}.json`);

      try {
        await fs.copyFile(this.lifetimeStatsPath, backupPath);
        console.log(`Backup created at: ${backupPath}`);
      } catch (error) {
        console.error('Failed to create backup:', error);
      }
    }

    // Reset files
    await this.initializeFiles();
  }
}

export default new CostTracker();