export function buildOperatorSpBarModel(operator) {
  const skills = operator?.skills ?? [operator?.skill].filter(Boolean);
  const skill = skills.find((item) => (item.triggerMode ?? 'manual') !== 'auto') ?? skills[0];
  if (!skill) {
    return { visible: false, ratio: 0, ready: false };
  }

  const spCost = Number(skill.spCost);
  if (!Number.isFinite(spCost) || spCost <= 0) {
    return { visible: false, ratio: 0, ready: false };
  }

  const sp = Number(skill.sp ?? 0);
  const currentSp = Number.isFinite(sp) ? sp : 0;
  return {
    visible: true,
    ratio: Math.max(0, Math.min(1, currentSp / spCost)),
    ready: currentSp >= spCost
  };
}
