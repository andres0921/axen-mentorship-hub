import { describe, it, expect, beforeEach } from 'vitest';
import { PROGRAM } from '../src/shared/config.js';
import {
  program, applyProgramSettings, loadProgramSettings, stageTarget, closedRequired,
  scoreThreshold, stageCount, computeGraduationProgress,
} from '../src/shared/program.js';

const DEFAULT_ROW = {
  stage_count: PROGRAM.stageCount,
  stage_targets: PROGRAM.stageTargets,
  graduation_closed_required: PROGRAM.graduationClosedRequired,
  graduation_score_threshold: PROGRAM.graduationScoreThreshold,
};

function fakeClient(result) {
  const q = {
    select: () => q, eq: () => q,
    maybeSingle: async () => (result instanceof Error ? { data: null, error: result } : { data: result, error: null }),
  };
  return { from: () => q };
}

describe('program config', () => {
  beforeEach(() => applyProgramSettings(DEFAULT_ROW));

  it('config.js defaults are the single fallback source', () => {
    expect(PROGRAM.stageCount).toBe(4);
    expect(Object.isFrozen(PROGRAM)).toBe(true);
    expect(stageTarget(1)).toBe(PROGRAM.stageTargets[1]);
    expect(closedRequired()).toBe(PROGRAM.graduationClosedRequired);
    expect(scoreThreshold()).toBe(PROGRAM.graduationScoreThreshold);
    expect(stageCount()).toBe(4);
  });

  it('program_settings row overrides the defaults', () => {
    applyProgramSettings({ stage_count: 3, stage_targets: { 1: 1, 2: 3, 3: 5 }, graduation_closed_required: 5, graduation_score_threshold: 3 });
    expect(stageCount()).toBe(3);
    expect(stageTarget(2)).toBe(3);
    expect(stageTarget(4)).toBe('—');
    expect(closedRequired()).toBe(5);
    expect(scoreThreshold()).toBe(3);
    expect(program().source).toBe('db');
  });

  it('allows 0 closed required (not treated as missing)', () => {
    applyProgramSettings({ ...DEFAULT_ROW, graduation_closed_required: 0 });
    expect(closedRequired()).toBe(0);
  });

  it('loadProgramSettings falls back to current values on error', async () => {
    const before = closedRequired();
    const warn = console.warn;
    console.warn = () => {};
    await loadProgramSettings(fakeClient(new Error('nope')));
    console.warn = warn;
    expect(closedRequired()).toBe(before);
  });

  it('loadProgramSettings applies the DB row', async () => {
    await loadProgramSettings(fakeClient({ ...DEFAULT_ROW, graduation_closed_required: 6 }));
    expect(closedRequired()).toBe(6);
  });
});

describe('computeGraduationProgress (twin of get_my_graduation_progress)', () => {
  beforeEach(() => applyProgramSettings(DEFAULT_ROW));

  it('nothing yet', () => {
    expect(computeGraduationProgress(null, null)).toEqual({
      closed: 0, closed_required: 4, closed_done: false, score_threshold: 4,
      vt_complete: false, lofty_proficient: false, nexa_connected: false,
      recommendation_status: 'not_started',
    });
  });

  it('uses check-in numbers against the threshold', () => {
    const p = computeGraduationProgress({ total_closed: 4, light_speed_vt_progress: 4, lofty_crm_usage: 3 }, null);
    expect(p.closed_done).toBe(true);
    expect(p.vt_complete).toBe(true);
    expect(p.lofty_proficient).toBe(false);
  });

  it('recommendation booleans count as done; nexa only from the recommendation', () => {
    const p = computeGraduationProgress({ total_closed: 1 }, {
      status: 'submitted', closed_transactions_confirmed: true, light_speed_vt_completed: true,
      lofty_crm_proficient: true, nexa_lending_connected: true,
    });
    expect(p).toMatchObject({ closed: 1, closed_done: true, vt_complete: true, lofty_proficient: true, nexa_connected: true, recommendation_status: 'submitted' });
  });

  it('respects explicit required/threshold', () => {
    const p = computeGraduationProgress({ total_closed: 2, lofty_crm_usage: 3 }, null, { required: 2, threshold: 3 });
    expect(p.closed_done).toBe(true);
    expect(p.lofty_proficient).toBe(true);
  });
});
