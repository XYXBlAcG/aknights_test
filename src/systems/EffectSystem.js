let effectSequence = 0;

export function createEffectSystem() {
  return new EffectSystem();
}

export class EffectSystem {
  constructor() {
    this.effects = [];
  }

  add(effect) {
    effectSequence += 1;
    const created = {
      id: `effect-${effectSequence}`,
      elapsed: 0,
      ...effect
    };
    this.effects.push(created);
    return created;
  }

  tick(deltaSeconds) {
    this.effects.forEach((effect) => {
      effect.elapsed = Math.round((effect.elapsed + deltaSeconds) * 1000) / 1000;
    });
    this.effects = this.effects.filter((effect) => effect.elapsed < effect.duration);
  }

  list() {
    return this.effects.map((effect) => ({ ...effect, payload: structuredClone(effect.payload) }));
  }

  clear() {
    this.effects = [];
  }
}

export function createOperatorAttackEffect({ source, target, color = '#f6c445' }) {
  return {
    type: 'operator_attack',
    duration: 0.28,
    payload: { source, target, color }
  };
}

export function createEnemyAttackEffect({ source, target, color = '#ec5757' }) {
  return {
    type: 'enemy_attack',
    duration: 0.32,
    payload: { source, target, color }
  };
}

export function createEnemyDeathEffect({ cell, color = '#e15f5f', phaseBreak = false }) {
  return {
    type: 'enemy_death',
    duration: phaseBreak ? 0.45 : 0.62,
    payload: { cell, color, phaseBreak }
  };
}

export function createWaveWarningEffect({ pathId, enemyType, wave, count, startTime, duration = 2 }) {
  return {
    type: 'wave_warning',
    duration,
    payload: { pathId, enemyType, wave, count, startTime }
  };
}
