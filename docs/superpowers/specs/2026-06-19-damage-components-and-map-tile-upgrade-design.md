# Damage Components And Map Tile Upgrade Design

## 1. Goal

This phase replaces the current single `attack + damageType` combat model with a component-based damage model for operators, enemies, and skills. It also upgrades map tiles with deployability metadata, visible enemy entry/exit tiles, enemy life value, enemy block bypass editing, enemy skills, and neural damage feedback.

The chosen approach is方案 B: runtime combat should use the new structures directly. Legacy fields are migration inputs only and should not remain the source of battle behavior.

## 2. Scope

This phase includes:

- Operator and enemy normal attacks defined by `normalAttack`.
- Damage components for physical, arts, and neural damage.
- Skills for operators and enemies using the same damage component model.
- Enemy HP-threshold auto skills.
- Operator SP display during active skills draining from full to empty by remaining duration.
- Resistance expressed as `0..100`, not `0..0.95`.
- Neural damage accumulation and visual bar for operators.
- Red entry tiles and blue exit tiles.
- Path tile deployability metadata.
- Enemy `blockBypass` editing in the custom editor.
- Enemy `lifeValue` deducted from base life on leak.
- Three experimental maps that demonstrate the new mechanics after implementation.
- Default data and stored custom catalog migration to the new structure.

This phase does not include:

- A full scripting engine for arbitrary skill logic.
- Persistent versioned data migration UI.
- Enemy neural damage bars; this phase applies neural damage only to operators.
- Configurable neural trauma threshold per operator; the first version uses one global rule.

## 3. Runtime Data Model

### 3.1 Damage Components

Damage is represented as an ordered list:

```js
[
  { type: 'physical', value: 120 },
  { type: 'arts', value: 80 },
  { type: 'neural', value: 35 }
]
```

Allowed `type` values:

- `physical`
- `arts`
- `neural`

Every component resolves independently. A single attack or skill can apply several components to the same target.

### 3.2 Normal Attack

Operators and enemies define normal attacks with:

```js
normalAttack: {
  interval: 1.5,
  range: { type: 'melee', radius: 0 },
  targeting: 'blocked-first',
  components: [{ type: 'physical', value: 18 }]
}
```

Runtime combat reads `normalAttack` only. Legacy fields such as `attack`, `attackInterval`, `damageType`, `range`, and `targeting` are normalized into `normalAttack` by validators and migration helpers.

### 3.3 Skill Model

Operator and enemy skills share the same shape:

```js
{
  id: 'power_strike',
  name: '强袭',
  description: '对目标造成多段伤害。',
  triggerMode: 'manual',
  spCost: 16,
  duration: 10,
  hpThresholdPercent: null,
  range: { type: 'melee', radius: 0 },
  targeting: 'blocked-first',
  components: [{ type: 'physical', value: 54 }],
  effects: [{ type: 'attack_multiplier', value: 1.6 }]
}
```

Allowed `triggerMode` values:

- `manual`: operator player activation.
- `auto`: operator auto activation when SP is full.
- `hp_threshold`: enemy activation when HP percent is at or below `hpThresholdPercent`.

Operator skill SP behavior:

- Before activation, SP charges from `0` to `spCost`.
- Instant skills reset SP to `0`.
- Duration skills set `activeRemaining = duration`.
- During a duration skill, the rendered SP ratio is `activeRemaining / duration`, so it drains from full to empty.
- When duration ends, `activeRemaining` reaches `0`, and charging resumes from `0`.

Enemy skill behavior:

- The first version supports HP-threshold skills.
- Each HP-threshold enemy skill activates once per phase unless the phase is reset.
- Enemy skill activation can apply damage components and/or effects.

## 4. Damage Rules

### 4.1 Physical Damage

```js
damage = Math.max(0, component.value - target.defense)
```

There is no minimum chip damage in the new formula for this phase.

### 4.2 Arts Damage

Resistance is an integer or decimal number from `0` to `100`.

```js
damage = Math.max(0, Math.round(component.value * (1 - target.resistance / 100)))
```

Legacy resistance values from `0` to `0.95` are migrated by multiplying by `100`.

### 4.3 Neural Damage

Neural damage applies to operators in this phase.

Operator runtime fields:

```js
neuralDamage: 0,
neuralThreshold: 100
```

When a neural component hits an operator:

1. Add `component.value` to `operator.neuralDamage`.
2. If `operator.neuralDamage >= operator.neuralThreshold`, set `operator.neuralDamage = 0`.
3. Deal neural burst HP loss equal to `25%` of operator `maxHp`, rounded to the nearest integer.

The Canvas renderer shows a separate neural bar above the operator when `neuralDamage > 0`.

## 5. Combat Flow

### 5.1 Operator Attacks

The combat system selects targets using `operator.normalAttack.range` and `operator.normalAttack.targeting`.

For healing operators, healing is represented as an effect rather than a damage component:

```js
effects: [{ type: 'heal', value: 80 }]
```

The normal attack model still owns interval, range, and targeting.

### 5.2 Enemy Attacks

Enemies use `enemy.normalAttack` for melee or ranged attacks.

If an enemy is blocked, blocker targeting still has priority unless the enemy normal attack targeting says otherwise. If no blocker exists and the enemy has a ranged attack, it can target operators in range.

### 5.3 Skill Attacks

Skills that contain `components` select a target using their own `range` and `targeting`. If a skill omits `range` or `targeting`, it falls back to the unit normal attack settings.

Effects are applied after damage components for the same skill activation.

## 6. Enemy Life Value And Block Bypass

Enemies define:

```js
lifeValue: 1,
blockBypass: 0
```

When an enemy reaches its path exit, the game deducts `enemy.lifeValue` from `lives`.

`blockBypass` means the enemy can pass through an operator if `blockBypass > operator.block`. Existing block checks should be renamed in UI to “反阻挡数” while keeping the runtime field name `blockBypass`.

Enemy phases can override:

- `maxHp`
- `speed`
- `defense`
- `resistance`
- `normalAttack`
- `skills`
- `canBeBlocked`
- `blockBypass`
- `lifeValue`
- `color`
- `description`

## 7. Map Tile Metadata

Maps keep the existing `grid` array and add optional metadata:

```js
tileMeta: {
  "3,2": { deployable: false }
}
```

Rules:

- `path` tiles are deployable by ground operators by default.
- `path` tiles with `deployable: false` reject ground deployment.
- Path entry tiles and exit tiles always reject deployment.
- `high` tiles keep their existing high-ground deployment behavior.
- `wall` tiles are never deployable.

Entry and exit tiles are derived from each path:

- First point in a path: entry tile, rendered red.
- Last point in a path: exit tile, rendered blue.

If several paths share a tile, entry/exit rendering takes priority over ordinary path rendering. If a tile is both entry and exit because of malformed short paths, validation should reject the path because paths must contain at least two points.

## 8. Editors

### 8.1 Custom Editor

The custom editor must support:

- Operator normal attack interval, range, targeting, and components.
- Operator skills with components and effects.
- Enemy normal attack interval, range, targeting, and components.
- Enemy HP-threshold skills.
- Enemy `blockBypass` with label “反阻挡数”.
- Enemy `lifeValue` with label “目标价值”.
- Resistance inputs from `0` to `100`.

The range painter can be reused for:

- Operator normal attack range.
- Operator skill range.
- Enemy normal attack range.
- Enemy skill range.

### 8.2 Map Editor

The map editor adds a deployability tool:

- Paint path/high/wall remains unchanged.
- A separate toggle marks selected path tiles as ground-deployable or ground-forbidden.
- Multi-cell drag and Shift-box selection apply to deployability edits.
- Exported map JSON includes `tileMeta`.
- Imported maps without `tileMeta` behave as fully deployable path maps except entry/exit tiles.

## 9. Rendering

Battle renderer:

- Entry path tile: red overlay.
- Exit path tile: blue overlay.
- Ground-forbidden path tile: darker path tile with diagonal hatch or warning border.
- Operator neural bar above HP/SP when `neuralDamage > 0`.
- Operator SP bar uses active skill drain ratio while a duration skill is active.
- Enemy intel panel displays range, components, block bypass, and life value.

Editor renderer:

- Same entry, exit, and forbidden path tile overlays.
- Path point numbering remains visible.

## 10. Experimental Maps

After the mechanics are implemented, add three map JSON files under `maps/` and include them in the battle page map library defaults.

### 10.1 Neural Damage Lab

File: `maps/neural-damage-lab.json`

Purpose:

- Demonstrates enemy neural damage components.
- Forces players to watch operator neural bars, rotate blockers, and use healing/defensive skills.
- Uses enemies with ranged neural skills and ordinary physical attacks so the difference between HP loss and neural buildup is visible.

Required mechanics shown:

- Neural damage accumulation.
- Neural burst HP loss.
- Enemy attack range.
- Operator SP drain during active skills.

### 10.2 Restricted Entry Test

File: `maps/restricted-entry-test.json`

Purpose:

- Demonstrates red entry tiles, blue exit tiles, and ground forbidden path tiles.
- Uses paths where tempting choke points are marked as non-deployable, requiring placement around the route.
- Includes at least two paths so entry/exit overlays are visible in multiple places.

Required mechanics shown:

- Entry tiles cannot be deployed on.
- Exit tiles cannot be deployed on.
- `tileMeta` forbidden path tiles cannot be deployed on.
- Forbidden path tiles have distinct rendering in battle and editor.

### 10.3 High Value Breakthrough

File: `maps/high-value-breakthrough.json`

Purpose:

- Demonstrates enemy `lifeValue`, `blockBypass`, and HP-threshold skills.
- Uses a small number of high-value enemies so one leak causes major base life loss.
- Includes enemies whose HP-threshold skill changes pressure near the front line.

Required mechanics shown:

- `lifeValue` deducts more than one life on leak.
- `blockBypass` lets enemies pass low-block operators.
- Enemy HP-threshold skills trigger once.
- Multi-component damage from skills.

These maps are experimental validation assets, not replacement default progression maps. They should appear after the existing three default maps in selection order.

## 11. Migration

### 11.1 Operator Migration

Legacy operator fields:

```js
attack,
damageType,
attackInterval,
range,
targeting
```

become:

```js
normalAttack: {
  interval: attackInterval,
  range,
  targeting,
  components: damageType === 'heal'
    ? []
    : [{ type: damageType === 'arts' ? 'arts' : 'physical', value: attack }]
},
effects: damageType === 'heal'
  ? [{ type: 'heal', value: attack }]
  : []
```

Legacy skill types map as follows:

- `instant_cost` becomes an effect `{ type: 'cost', value: amount }`.
- `instant_heal` becomes an effect `{ type: 'heal', value: amount }`.
- `buff` keeps duration and maps multipliers into `effects`.
- `next_attack` becomes a duration or single-use effect `{ type: 'next_attack_multiplier', value }`.

### 11.2 Enemy Migration

Legacy enemy fields:

```js
attack,
damageType,
attackInterval,
range,
targeting
```

become:

```js
normalAttack: {
  interval: attackInterval,
  range,
  targeting,
  components: attack > 0
    ? [{ type: damageType === 'arts' ? 'arts' : 'physical', value: attack }]
    : []
}
```

Legacy `resistance <= 1` values are multiplied by `100`.

Legacy enemies without `lifeValue` receive `lifeValue: 1`.

## 12. Testing Strategy

Add focused tests before implementation:

- `tests/damage-system.test.js`
  - physical subtracts defense.
  - arts uses `0..100` resistance.
  - multiple components stack.
  - neural damage fills and bursts.
- `tests/catalog-validators.test.js`
  - legacy operator migrates into `normalAttack`.
  - legacy enemy migrates into `normalAttack`.
  - resistance `0.1` migrates to `10`.
  - new component arrays validate.
- `tests/combat-flow.test.js`
  - operator normal attack uses components.
  - enemy ranged attack uses components.
  - enemy HP-threshold skill fires once.
- `tests/deployment-cost.test.js`
  - entry and exit tiles reject deployment.
  - `tileMeta` forbidden path tile rejects deployment.
- `tests/game.test.js`
  - enemy leak deducts `lifeValue`.
  - active skill SP ratio drains with duration.
- `tests/editor-model.test.js`
  - map editor exports `tileMeta`.
  - batch deployability edits work.
- `tests/custom-editor-model.test.js`
  - custom enemy edits `blockBypass` and `lifeValue`.
  - custom skills can store multiple components.
- `tests/browser-adapters.test.js`
  - UI view models expose components, life value, block bypass, neural ratio, and active SP ratio.
- `tests/default-maps.test.js`
  - the three experimental maps normalize and validate.
  - each experimental map contains the expected showcase mechanic fields.

Full verification remains:

```bash
npm test
npm run build
```

Browser verification should check:

- Battle page loads.
- Default maps remain playable.
- The three experimental maps appear after the existing default maps.
- Custom editor can edit a component.
- Map editor can mark a path tile forbidden and export it.

## 13. Implementation Order

1. Create `DamageSystem` and migrate validators.
2. Update default operators and enemies to new structures.
3. Update `Operator` and `Enemy` runtime entities.
4. Replace combat calculations with damage components.
5. Replace skill activation with the new unified skill/effect model.
6. Add enemy HP-threshold skill processing.
7. Add `tileMeta`, entry/exit deployment blocking, and `lifeValue` leak logic.
8. Update Canvas rendering and UI view models.
9. Update custom editor.
10. Update map editor.
11. Add three experimental maps and register them as default selectable maps.
12. Run full automated and browser verification.

## 14. Compatibility Decisions

Runtime code should prefer new structures. Legacy structures are handled only at catalog/map loading boundaries.

If malformed custom localStorage data cannot migrate, it should be skipped with a warning, matching the current custom catalog behavior.

Default maps do not need manual JSON edits for entry/exit rendering because entries and exits are derived from existing path points.
