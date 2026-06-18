export function createEffectSystem() {
  return new EffectSystem();
}

export class EffectSystem {
  constructor() {
    this.effects = [];
    this.effectSequence = 0;
  }

  add(effect) {
    this.effectSequence += 1;
    const created = {
      id: `effect-${this.effectSequence}`,
      type: effect.type,
      elapsed: 0,
      duration: effect.duration,
      payload: structuredClone(effect.payload)
    };
    this.effects.push(created);
    return cloneEffect(created);
  }

  tick(deltaSeconds) {
    this.effects.forEach((effect) => {
      effect.elapsed = Math.round((effect.elapsed + deltaSeconds) * 1000) / 1000;
    });
    this.effects = this.effects.filter((effect) => effect.elapsed < effect.duration);
  }

  list() {
    return this.effects.map((effect) => cloneEffect(effect));
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

function cloneEffect(effect) {
  return {
    ...effect,
    payload: structuredClone(effect.payload)
  };
}
