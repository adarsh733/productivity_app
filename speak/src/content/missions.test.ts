import {
  LANES,
  MISSIONS,
  missionById,
  missionsForLane,
  pickMission,
  recommendedLane,
} from './missions';

describe('mission library', () => {
  it('has no duplicate ids', () => {
    const ids = MISSIONS.map((mission) => mission.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Every lane on the Practice screen used to open the same office prompt.
  // A lane with no mission of its own would silently do that again.
  it('gives every advertised lane at least one mission of its own', () => {
    for (const { lane } of LANES) {
      const pool = missionsForLane(lane);
      expect(pool.length, `lane ${lane} has no missions`).toBeGreaterThan(0);
      expect(pool.every((mission) => mission.lane === lane)).toBe(true);
    }
  });

  it('keeps the Hindi lane in Hindi', () => {
    const hindi = missionsForLane('vocab_hi');
    expect(hindi.length).toBeGreaterThan(0);
    expect(hindi.every((mission) => mission.lang === 'hi')).toBe(true);
  });

  it('offers exactly three corrections per mission, each with one redo target', () => {
    for (const mission of MISSIONS) {
      expect(mission.focus, mission.id).toHaveLength(3);
      const ids = mission.focus.map((option) => option.id);
      expect(new Set(ids).size, `${mission.id} repeats a focus`).toBe(3);
      for (const option of mission.focus) {
        expect(option.redoTarget.length, `${mission.id}/${option.id}`).toBeGreaterThan(0);
        expect(option.correction.length, `${mission.id}/${option.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('resolves every mission by id', () => {
    for (const mission of MISSIONS) {
      expect(missionById(mission.id)?.id).toBe(mission.id);
    }
    expect(missionById('does-not-exist')).toBeUndefined();
  });
});

describe('mission selection', () => {
  it('is stable within a day and moves across days', () => {
    const monday = pickMission('office', '2026-08-17');
    expect(pickMission('office', '2026-08-17').id).toBe(monday.id);

    const week = new Set(
      ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'].map(
        (date) => pickMission('office', date).id,
      ),
    );
    expect(week.size).toBeGreaterThan(1);
  });

  it('always returns a mission from the lane asked for', () => {
    for (const { lane } of LANES) {
      expect(pickMission(lane, '2026-08-15').lane).toBe(lane);
    }
  });

  it('skips prompts already recorded today', () => {
    const first = pickMission('office', '2026-08-15');
    const second = pickMission('office', '2026-08-15', [first.id]);
    expect(second.id).not.toBe(first.id);
    expect(second.lane).toBe('office');
  });

  it('still returns something when every prompt in the lane is used up', () => {
    const all = missionsForLane('tone').map((mission) => mission.id);
    expect(all).toContain(pickMission('tone', '2026-08-15', all).id);
  });

  it('rotates the recommended lane across the week', () => {
    const lanes = new Set(
      ['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19'].map(recommendedLane),
    );
    expect(lanes.size).toBeGreaterThan(1);
  });
});
