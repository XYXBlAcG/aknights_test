export const DEFAULT_ENEMIES = {
  infantry: {
    id: 'infantry',
    name: '突进兵',
    maxHp: 100,
    attack: 12,
    defense: 0,
    resistance: 0,
    speed: 1.0,
    attackInterval: 1.5,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 3,
    color: '#e15f5f'
  },
  heavy: {
    id: 'heavy',
    name: '装甲兵',
    maxHp: 180,
    attack: 18,
    defense: 8,
    resistance: 0.05,
    speed: 0.65,
    attackInterval: 1.8,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 5,
    color: '#d89d4a'
  },
  drone: {
    id: 'drone',
    name: '飞行兵',
    maxHp: 120,
    attack: 0,
    defense: 0,
    resistance: 0,
    speed: 1.25,
    attackInterval: 1.5,
    canBeBlocked: false,
    isFlying: true,
    rewardCost: 5,
    color: '#5fd4ff'
  }
};
