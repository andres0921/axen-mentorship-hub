import { PROGRAM } from './config.js';

// Program rules = public.program_settings (DB, admin-editable) with
// src/shared/config.js PROGRAM as the fallback.
let current = { ...PROGRAM, stageTargets: { ...PROGRAM.stageTargets }, source: 'config' };

export function program() {
  return current;
}

export function applyProgramSettings(row) {
  if (!row) return current;
  const targets = row.stage_targets && typeof row.stage_targets === 'object' ? row.stage_targets : PROGRAM.stageTargets;
  current = {
    stageCount: Number(row.stage_count) || PROGRAM.stageCount,
    stageTargets: Object.fromEntries(Object.entries(targets).map(([k, v]) => [String(k), Number(v)])),
    graduationClosedRequired: Number.isFinite(Number(row.graduation_closed_required))
      ? Number(row.graduation_closed_required) : PROGRAM.graduationClosedRequired,
    graduationScoreThreshold: Number(row.graduation_score_threshold) || PROGRAM.graduationScoreThreshold,
    source: 'db',
  };
  return current;
}

export async function loadProgramSettings(client) {
  try {
    const { data, error } = await client
      .from('program_settings')
      .select('stage_count, stage_targets, graduation_closed_required, graduation_score_threshold')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return applyProgramSettings(data);
  } catch (err) {
    console.warn('program_settings unavailable, using config.js defaults', err);
    return current;
  }
}

export function stageTarget(stage) {
  const v = current.stageTargets[String(stage)];
  return v === undefined || v === null || Number.isNaN(v) ? '—' : v;
}

export function closedRequired() {
  return current.graduationClosedRequired;
}

export function scoreThreshold() {
  return current.graduationScoreThreshold;
}

export function stageCount() {
  return current.stageCount;
}
