import { Enemy } from '../entities/Enemy.js';

export function createWaveSystem({ timeline, enemyCatalog }) {
  return new WaveSystem({ timeline, enemyCatalog });
}

export class WaveSystem {
  constructor({ timeline = [], enemyCatalog }) {
    this.enemyCatalog = enemyCatalog;
    this.elapsed = 0;
    this.schedule = expandTimeline(timeline);
    this.spawnIndex = 0;
    this.currentWave = 0;
  }

  tick(deltaSeconds) {
    this.elapsed += deltaSeconds;
    const spawned = [];

    while (this.spawnIndex < this.schedule.length && this.schedule[this.spawnIndex].spawnTime <= this.elapsed) {
      const spawn = this.schedule[this.spawnIndex];
      const template = this.enemyCatalog[spawn.enemyType];
      if (!template) {
        throw new Error(`Unknown enemy type ${spawn.enemyType}`);
      }

      const enemy = new Enemy(template, {
        pathId: spawn.pathId,
        wave: spawn.wave,
        spawnTime: spawn.spawnTime
      });
      spawned.push(enemy);
      this.currentWave = Math.max(this.currentWave, spawn.wave);
      this.spawnIndex += 1;
    }

    return {
      spawned,
      currentWave: this.currentWave
    };
  }

  isComplete() {
    return this.spawnIndex >= this.schedule.length;
  }

  reset() {
    this.elapsed = 0;
    this.spawnIndex = 0;
    this.currentWave = 0;
  }
}

function expandTimeline(timeline) {
  return [...timeline]
    .sort((a, b) => a.startTime - b.startTime)
    .flatMap((event) => {
      const interval = event.interval ?? 0.8;
      return Array.from({ length: event.count }, (_, index) => ({
        wave: event.wave,
        enemyType: event.enemyType,
        pathId: event.pathId,
        spawnTime: event.startTime + interval * index
      }));
    })
    .sort((a, b) => a.spawnTime - b.spawnTime);
}
