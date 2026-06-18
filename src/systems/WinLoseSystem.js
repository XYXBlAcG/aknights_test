export function evaluateBattleResult({ lives, leaks, wavesComplete, enemiesRemaining }) {
  if (lives <= 0) {
    return {
      state: 'defeat',
      stars: 0
    };
  }

  if (wavesComplete && enemiesRemaining === 0) {
    return {
      state: 'victory',
      stars: leaks === 0 ? 3 : 2
    };
  }

  return {
    state: 'running',
    stars: 0
  };
}
