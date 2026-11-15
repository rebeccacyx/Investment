const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class JsonStorage {
  constructor({ portfolioPath, plansPath }) {
    this.portfolioPath = portfolioPath;
    this.plansPath = plansPath;
  }

  async readPortfolio() {
    return JSON.parse(await fs.readFile(this.portfolioPath, 'utf8'));
  }

  async listPlans() {
    try {
      const plans = JSON.parse(await fs.readFile(this.plansPath, 'utf8'));
      if (!Array.isArray(plans)) throw new Error('方案文件格式无效');
      return plans;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async savePlan(plan) {
    const plans = await this.listPlans();
    const next = [...plans, plan];
    const tempPath = path.join(path.dirname(this.plansPath),
      `.${path.basename(this.plansPath)}.${randomUUID()}.tmp`);
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
      await fs.rename(tempPath, this.plansPath);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError;
      }
      throw error;
    }
  }
}

module.exports = { JsonStorage };
