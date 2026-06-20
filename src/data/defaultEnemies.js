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
    damageType: 'physical',
    targeting: 'blocked-first',
    range: { type: 'melee', radius: 0 },
    normalAttack: {
      interval: 1.5,
      range: { type: 'melee', radius: 0 },
      targeting: 'blocked-first',
      components: [{ type: 'physical', value: 12 }],
      effects: []
    },
    skills: [],
    lifeValue: 1,
    blockBypass: 0,
    description: '基础敌方单位。',
    phases: [],
    color: '#e15f5f'
  },
  heavy: {
    id: 'heavy',
    name: '装甲兵',
    maxHp: 180,
    attack: 18,
    defense: 8,
    resistance: 5,
    speed: 0.65,
    attackInterval: 1.8,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 5,
    damageType: 'physical',
    targeting: 'blocked-first',
    range: { type: 'melee', radius: 0 },
    normalAttack: {
      interval: 1.8,
      range: { type: 'melee', radius: 0 },
      targeting: 'blocked-first',
      components: [{ type: 'physical', value: 18 }],
      effects: []
    },
    skills: [],
    lifeValue: 1,
    blockBypass: 0,
    description: '基础敌方单位。',
    phases: [],
    color: '#d89d4a'
  },
  'neural-caster': {
    id: 'neural-caster',
    name: '神经术师',
    maxHp: 140,
    attack: 18,
    defense: 2,
    resistance: 35,
    speed: 0.8,
    attackInterval: 2.2,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 6,
    damageType: 'arts',
    targeting: 'nearest',
    range: { type: 'diamond', radius: 2 },
    normalAttack: {
      interval: 2.2,
      range: { type: 'diamond', radius: 2 },
      targeting: 'nearest',
      components: [
        { type: 'arts', value: 18 },
        { type: 'neural', value: 32 }
      ],
      effects: []
    },
    skills: [{
      id: 'synapse_burst',
      name: '突触过载',
      description: '生命过半时对最近目标造成神经损伤。',
      triggerMode: 'hp_threshold',
      hpThresholdPercent: 50,
      range: { type: 'diamond', radius: 3 },
      targeting: 'nearest',
      components: [{ type: 'neural', value: 55 }],
      effects: []
    }],
    lifeValue: 2,
    blockBypass: 0,
    description: '远程法术单位，攻击会积累我方神经损伤。',
    phases: [],
    color: '#b98cff'
  },
  'block-breacher': {
    id: 'block-breacher',
    name: '突破领队',
    maxHp: 240,
    attack: 24,
    defense: 10,
    resistance: 10,
    speed: 0.7,
    attackInterval: 1.8,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 8,
    damageType: 'physical',
    targeting: 'blocked-first',
    range: { type: 'melee', radius: 0 },
    normalAttack: {
      interval: 1.8,
      range: { type: 'melee', radius: 0 },
      targeting: 'blocked-first',
      components: [{ type: 'physical', value: 24 }],
      effects: []
    },
    skills: [],
    lifeValue: 8,
    blockBypass: 3,
    description: '拥有较高目标价值，阻挡需求高于普通地面单位。',
    phases: [],
    color: '#ff8a4d'
  },
  'phase-breaker': {
    id: 'phase-breaker',
    name: '双相破阵者',
    maxHp: 180,
    attack: 20,
    defense: 12,
    resistance: 15,
    speed: 0.6,
    attackInterval: 1.9,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 10,
    damageType: 'physical',
    targeting: 'blocked-first',
    range: { type: 'melee', radius: 0 },
    normalAttack: {
      interval: 1.9,
      range: { type: 'melee', radius: 0 },
      targeting: 'blocked-first',
      components: [{ type: 'physical', value: 20 }],
      effects: []
    },
    skills: [],
    lifeValue: 4,
    blockBypass: 1,
    description: '拥有两段生命，第二阶段会切换为更快的远程法术攻击。',
    phases: [{
      name: '装甲外壳',
      maxHp: 180,
      attack: 20,
      defense: 16,
      resistance: 15,
      speed: 0.6,
      attackInterval: 1.9,
      canBeBlocked: true,
      normalAttack: {
        interval: 1.9,
        range: { type: 'melee', radius: 0 },
        targeting: 'blocked-first',
        components: [{ type: 'physical', value: 20 }],
        effects: []
      },
      lifeValue: 4,
      blockBypass: 1,
      color: '#d89d4a'
    }, {
      name: '源石核心',
      maxHp: 160,
      attack: 22,
      defense: 4,
      resistance: 45,
      speed: 0.95,
      attackInterval: 2.0,
      canBeBlocked: true,
      normalAttack: {
        interval: 2.0,
        range: { type: 'diamond', radius: 2 },
        targeting: 'nearest',
        components: [
          { type: 'arts', value: 22 },
          { type: 'neural', value: 20 }
        ],
        effects: []
      },
      skills: [{
        id: 'core_pulse',
        name: '核心脉冲',
        description: '生命降低时释放一次混合伤害。',
        triggerMode: 'hp_threshold',
        hpThresholdPercent: 45,
        range: { type: 'diamond', radius: 2 },
        targeting: 'nearest',
        components: [
          { type: 'arts', value: 30 },
          { type: 'neural', value: 30 }
        ],
        effects: []
      }],
      lifeValue: 4,
      blockBypass: 2,
      color: '#ec5757'
    }],
    color: '#ec5757'
  },
  'crisis-avenger': {
    id: 'crisis-avenger',
    name: '危机复仇者',
    maxHp: 900,
    attack: 42,
    defense: 28,
    resistance: 35,
    speed: 0.55,
    attackInterval: 1.8,
    canBeBlocked: true,
    isFlying: false,
    rewardCost: 18,
    elite: true,
    boss: true,
    damageType: 'physical',
    targeting: 'nearest',
    range: { type: 'diamond', radius: 2 },
    normalAttack: {
      interval: 1.8,
      range: { type: 'diamond', radius: 2 },
      targeting: 'nearest',
      components: [
        { type: 'physical', value: 42 },
        { type: 'arts', value: 18 }
      ],
      effects: []
    },
    skills: [{
      id: 'contract_mark',
      name: '危机印记',
      description: '生命降低至60%时对最近目标造成法术伤害和神经损伤。',
      triggerMode: 'hp_threshold',
      hpThresholdPercent: 60,
      range: { type: 'diamond', radius: 3 },
      targeting: 'nearest',
      components: [
        { type: 'arts', value: 55 },
        { type: 'neural', value: 50 }
      ],
      effects: []
    }],
    lifeValue: 10,
    blockBypass: 3,
    description: '高难度Boss单位，具有高目标价值、远程混合攻击和两阶段形态。',
    phases: [{
      name: '重装压制',
      maxHp: 900,
      attack: 42,
      defense: 32,
      resistance: 35,
      speed: 0.55,
      attackInterval: 1.8,
      canBeBlocked: true,
      normalAttack: {
        interval: 1.8,
        range: { type: 'diamond', radius: 2 },
        targeting: 'nearest',
        components: [
          { type: 'physical', value: 42 },
          { type: 'arts', value: 18 }
        ],
        effects: []
      },
      skills: [{
        id: 'contract_mark',
        name: '危机印记',
        description: '生命降低至60%时对最近目标造成法术伤害和神经损伤。',
        triggerMode: 'hp_threshold',
        hpThresholdPercent: 60,
        range: { type: 'diamond', radius: 3 },
        targeting: 'nearest',
        components: [
          { type: 'arts', value: 55 },
          { type: 'neural', value: 50 }
        ],
        effects: []
      }],
      lifeValue: 10,
      blockBypass: 3,
      color: '#c04b62'
    }, {
      name: '复仇协议',
      maxHp: 720,
      attack: 52,
      defense: 18,
      resistance: 45,
      speed: 0.85,
      attackInterval: 1.45,
      canBeBlocked: true,
      normalAttack: {
        interval: 1.45,
        range: { type: 'diamond', radius: 2.5 },
        targeting: 'lowest-hp-percent',
        components: [
          { type: 'arts', value: 52 },
          { type: 'neural', value: 28 }
        ],
        effects: []
      },
      skills: [{
        id: 'revenge_pulse',
        name: '复仇脉冲',
        description: '生命降低至45%时释放高额混合伤害。',
        triggerMode: 'hp_threshold',
        hpThresholdPercent: 45,
        range: { type: 'diamond', radius: 3 },
        targeting: 'lowest-hp-percent',
        components: [
          { type: 'physical', value: 35 },
          { type: 'arts', value: 45 },
          { type: 'neural', value: 45 }
        ],
        effects: []
      }],
      lifeValue: 10,
      blockBypass: 4,
      color: '#ff5c73'
    }],
    color: '#c04b62'
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
    damageType: 'physical',
    targeting: 'blocked-first',
    range: { type: 'melee', radius: 0 },
    normalAttack: {
      interval: 1.5,
      range: { type: 'melee', radius: 0 },
      targeting: 'blocked-first',
      components: [],
      effects: []
    },
    skills: [],
    lifeValue: 1,
    blockBypass: 0,
    description: '飞行单位，不会被地面阻挡。',
    phases: [],
    color: '#5fd4ff'
  }
};
