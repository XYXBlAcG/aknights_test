export function createCostSystem({ initialCost = 0, maxCost = 30 } = {}) {
  return new CostSystem(initialCost, maxCost);
}

export class CostSystem {
  constructor(initialCost, maxCost) {
    this.current = Math.min(initialCost, maxCost);
    this.max = maxCost;
    this.naturalTimer = 0;
    this.lastDelta = 0;
  }

  canSpend(amount) {
    return this.current >= amount;
  }

  spend(amount) {
    if (!this.canSpend(amount)) {
      return false;
    }
    this.current -= amount;
    this.lastDelta = -amount;
    return true;
  }

  add(amount) {
    const before = this.current;
    this.current = Math.min(this.max, this.current + amount);
    this.lastDelta = this.current - before;
    return this.current - before;
  }

  refund(amount) {
    return this.add(amount);
  }

  tick(deltaSeconds, operators = []) {
    this.naturalTimer += deltaSeconds;
    while (this.naturalTimer >= 1) {
      this.add(1);
      this.naturalTimer -= 1;
    }

    operators.forEach((operator) => {
      if (operator.trait !== 'deployed_cost_regen' || operator.isDead) {
        return;
      }
      operator.traitTimer += deltaSeconds;
      while (operator.traitTimer >= 3) {
        this.add(2);
        operator.traitTimer -= 3;
      }
    });
  }
}
