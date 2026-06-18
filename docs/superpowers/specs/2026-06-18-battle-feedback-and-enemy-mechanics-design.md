# Battle Feedback And Enemy Mechanics Design

## 1. Goal

This phase upgrades the playable browser tower-defense prototype with richer battle feedback and deeper enemy behavior.

The scope is intentionally limited to the battle-facing part of the request:

- Enemy death animation.
- Operator attack animation.
- Wave route warning animation before enemies spawn.
- Enemy attack range and ranged attacks.
- Enemy block bypass when enemy anti-block value exceeds an operator's block count.
- Multi-phase enemies, including two-health-bar style enemies.
- Operator SP bars rendered below HP bars on the battlefield.
- Canceling a selected operator card before deployment.
- Map deploy limit display in the battle page.
- Redeploy cooldown after retreat.
- First-seen enemy intel panel in the lower right.

The local map library, map deletion, map editing jump, localStorage map persistence, and editor leave-warning are a separate follow-up phase. They should not block this phase or be mixed into the same implementation plan.

## 2. Existing Context

The current game has a stable 2D Canvas battle loop:

- `Game` owns battle state, systems, map, elapsed time, operators, enemies, selection, cost, waves, and win/loss.
- `WaveSystem` expands timeline events and spawns `Enemy` instances.
- `BlockingSystem` assigns ground enemies to ground operators on the same cell.
- `CombatSystem` handles operator attacks, healing, and blocked enemy attacks.
- `SkillSystem` handles operator SP, active skills, auto skills, and manual skill readiness.
- `DeploymentSystem` handles terrain legality, total/class deploy limits, deploy, and retreat.
- `CanvasRenderer` draws map, paths, deployment preview, ranges, operators, enemies, HP bars, and skill-ready hints.
- `UIController` renders the battle header, operator deck, info panel, controls, result modal, map import, and direction-based deployment flow.

This phase keeps the current architecture: battle systems mutate gameplay state; renderers draw only from state; UI controllers adapt DOM events to `Game` methods.

## 3. Effect System

Add a lightweight `EffectSystem` owned by `Game`.

Effect records are visual-only:

```js
{
  id,
  type,
  elapsed,
  duration,
  payload
}
```

Core effect types:

- `operator_attack`: shown when an operator attacks or heals.
- `enemy_attack`: shown when an enemy attacks, including ranged attacks.
- `enemy_death`: shown when an enemy is defeated or a phase breaks.
- `wave_warning`: shown shortly before a timeline spawn event begins.

Rules:

- Effects never decide combat results.
- Effects advance with scaled battle time and are paused when battle is paused.
- Finished effects are removed automatically.
- Renderers tolerate unknown effect types.
- Tests assert effect creation and expiry through pure state, not pixel output.

`CanvasRenderer` draws simple first-pass animations:

- Attack: short line, arc, or flash from source to target.
- Death: shrinking/fading ring around enemy position.
- Wave warning: pulsing path segment or markers along the route before spawn.

## 4. Wave Route Warning

`WaveSystem` currently only returns spawned enemies. It should expose upcoming spawn events in a small warning window.

Design:

- A map or game-level setting defines `waveWarningSeconds`, default `2`.
- When an event's `startTime - elapsed <= waveWarningSeconds` and the event has not been warned yet, `Game` creates one `wave_warning` effect.
- The warning payload includes `pathId`, `enemyType`, `wave`, `count`, and event start time.
- The renderer uses the map path points to draw a pulsing route overlay.

This keeps timeline warning logic deterministic and avoids scanning every path in the renderer.

## 5. Enemy Template Extensions

Extend enemy templates through `CatalogValidators`, default enemy data, custom data storage, and `Enemy` runtime state.

New optional fields:

```js
{
  damageType: 'physical' | 'arts',
  range: { type: 'melee' | 'diamond' | 'pattern', ... },
  targeting: 'blocked-first' | 'nearest' | 'lowest-hp-percent',
  blockBypass: 0,
  phases: [
    {
      name,
      maxHp,
      attack,
      defense,
      resistance,
      speed,
      attackInterval,
      range,
      damageType,
      color,
      description
    }
  ]
}
```

Defaults:

- `damageType`: `physical`.
- `range`: melee/self cell for existing enemies.
- `targeting`: `blocked-first`.
- `blockBypass`: `0`.
- `phases`: empty.

Existing enemy JSON and localStorage data remain valid.

## 6. Ranged Enemy Combat

Enemy attacks are no longer limited to blocked enemies.

Target selection:

- If the enemy is blocked, it prioritizes the blocker.
- If the enemy has a non-melee range, it can attack operators inside its range.
- `blocked-first` attacks the blocker first, then any in-range ground/high operator.
- `nearest` picks the closest in-range operator by Manhattan distance.
- `lowest-hp-percent` picks the most injured in-range operator.

Damage:

- `physical` uses current physical damage calculation against operator defense.
- `arts` uses attack multiplied by `1 - resistance`.
- Ranged attacks use the same `attackInterval`.

Ranged enemies keep moving unless they are blocked. Attacking does not stop movement unless the existing blocking rules stop them.

## 7. Block Bypass

`BlockingSystem` considers `enemy.blockBypass`.

Rule:

- If `enemy.blockBypass > operator.block`, that operator cannot block the enemy.
- The enemy may pass through that cell.
- If multiple operators could block in future rules, the same comparison applies to each candidate.

Current one-operator-per-cell rules remain unchanged.

Flying enemies still ignore blocking regardless of `blockBypass`.

## 8. Multi-Phase Enemies

Enemies may define phases to simulate multiple HP bars or boss forms.

Runtime state:

```js
enemy.phaseIndex
enemy.phaseHp
enemy.maxPhaseHp
enemy.phases
```

Rules:

- If `phases` is empty, enemy behavior stays as it is today.
- If phases exist, phase 0 initializes the enemy's current stats.
- Damage reduces current phase HP.
- When a phase reaches 0 and another phase exists:
  - Advance `phaseIndex`.
  - Apply next phase stats.
  - Reset current phase HP to next phase max HP.
  - Clear `blockedBy` only if the next phase sets `canBeBlocked === false`.
  - Emit an `enemy_death` or `phase_break` visual effect.
  - Do not award kill cost yet.
- When the final phase reaches 0, the enemy dies and kill reward is awarded once.

The first renderer pass can show multi-phase status as stacked or segmented HP bars. A two-phase enemy should visibly read as two health bars.

## 9. Operator SP Bars On Battlefield

`CanvasRenderer.drawOperators` draws an SP bar under the HP bar.

Rules:

- Prefer the first manual skill.
- If no manual skill exists, use the first skill.
- If the operator has no skill, do not draw an SP bar.
- The bar fills from `skill.sp / skill.spCost`.
- Ready manual skills keep the existing ready marker.

This reduces the need to open the right-side info panel to check skill readiness.

## 10. Selection And Redeploy UX

Operator deck behavior:

- Clicking an unselected, deployable operator selects it.
- Clicking the same selected operator card again cancels selection.
- Canceling also clears pending deployment direction selection.

Redeploy cooldown:

- Retreated operators add a template-level cooldown entry.
- Default cooldown is 10 seconds unless later configured by template or map.
- During cooldown, the deck card is disabled and shows remaining seconds.
- Cooldown advances with scaled battle time while battle is running.
- Dead operators do not create cooldown in this phase unless they were explicitly retreated.

Deploy limit display:

- The battle page displays current deployed count and map deploy limit.
- If a map defines `deployLimit`, use it.
- Otherwise use the existing global total deploy limit.
- `DeploymentSystem` should read this map-specific limit.

## 11. Enemy Intel Panel

When an enemy template appears for the first time in a battle, the UI shows a lower-right intel panel.

Panel contents:

- Enemy name.
- HP or phase count.
- Attack, defense, resistance, speed.
- Range summary.
- Traits: flying, unblockable, block bypass, ranged, boss/elite.
- Short description if available.

Rules:

- Show once per enemy type per battle.
- New enemy intel entries queue if several new types spawn at the same time.
- The panel auto-dismisses after a few seconds and can also be closed manually.
- It does not pause gameplay.

## 12. Testing Plan

Add failing tests before implementation for:

- `EffectSystem` creates and expires attack/death/wave warning effects.
- `WaveSystem` or `Game` emits a warning before a scheduled spawn.
- Enemy validation normalizes `range`, `damageType`, `blockBypass`, and `phases`.
- Ranged enemies damage operators in range without being blocked.
- Physical and arts enemy damage use the expected mitigation.
- Enemies with `blockBypass > operator.block` are not blocked.
- Multi-phase enemies switch phase before death and only reward cost on final death.
- Operator deck model supports cancel selection and redeploy cooldown state.
- Retreat creates cooldown and blocks immediate redeploy.
- Renderer adapter/model exposes operator SP bar data.
- First-seen enemy intel is queued once per enemy type.

Browser checks should verify:

- Battle page loads without console errors.
- Deploy selection can be canceled by clicking the selected card again.
- Retreat disables the card with a countdown.
- SP bars and enemy intel panel are visible.
- Wave route warning and death/attack animations appear during a short battle.

## 13. Out Of Scope For This Phase

The following are intentionally deferred:

- Local map library management.
- Persisted imported map list in localStorage.
- Deleting imported maps.
- Editing imported maps through a map-management panel.
- Editor leave-warning for unsaved changes.
- Enemy skill scripting.
- Audio, sprite sheets, or particle-heavy animation systems.
- Three.js parity for the new visual effects.
