import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, matchRuns, isRun, LAYOUTS, SPINNING_DOW, SPINNING_TITLE, weekday } from '../../marathon/plan.js';

// Live settings (issue #14): runsPerWeek 3, rest unchanged.
const LIVE = { startDate: '2026-11-30', goalTime: '3:59:00', runsPerWeek: 3, currentWeeklyKm: 8, currentLongRunKm: 7, peakWeeklyKm: 60 };
const TUESDAY = 1;

for (const runsPerWeek of [3, 4, 5, 6]) {
  test(`${runsPerWeek} loopjes: nooit een loop op dinsdag, ook niet in de raceweek`, () => {
    const plan = buildPlan({ ...LIVE, runsPerWeek });
    for (const w of plan.weeks) {
      assert.equal(w.days.length, 7);
      const tue = w.days[TUESDAY];
      assert.equal(weekday(tue.date), TUESDAY, `${tue.date} is een dinsdag`);
      assert.equal(isRun(tue), false, `week ${w.index}: ${tue.title} op dinsdag`);
      assert.equal(tue.km, 0);
      assert.equal(tue.type, 'cross');
      assert.equal(tue.title, SPINNING_TITLE);
      for (const d of w.days) if (isRun(d)) assert.notEqual(weekday(d.date), TUESDAY);
    }
  });

  test(`${runsPerWeek} loopjes: hoogstens ${runsPerWeek} loopjes per week`, () => {
    const plan = buildPlan({ ...LIVE, runsPerWeek });
    for (const w of plan.weeks) {
      const runs = w.days.filter(isRun).length;
      assert.ok(runs <= runsPerWeek, `week ${w.index} heeft ${runs} loopjes`);
    }
    // Regular weeks use exactly runsPerWeek runs.
    assert.equal(plan.weeks[0].days.filter(isRun).length, runsPerWeek);
  });
}

test('layouts laten dinsdag vrij', () => {
  assert.equal(SPINNING_DOW, TUESDAY);
  for (const [n, layout] of Object.entries(LAYOUTS)) {
    assert.equal(layout[TUESDAY], undefined, `layout ${n} plant iets op dinsdag`);
    assert.equal(Object.keys(layout).length, Number(n));
  }
});

test('3 loopjes: woensdag kwaliteit, vrijdag rustig, zondag lang', () => {
  const plan = buildPlan(LIVE);
  const w = plan.weeks[0];
  assert.deepEqual(w.days.filter(isRun).map((d) => d.dow), [2, 4, 6]);
  assert.equal(w.days[6].type, 'long');
  assert.equal(w.days[4].type, 'easy');
});

test('raceweek: kort marathontempo op woensdag, wedstrijd op zondag', () => {
  const plan = buildPlan(LIVE);
  const race = plan.weeks.at(-1);
  assert.equal(race.days[6].type, 'race');
  assert.equal(race.days[6].date, '2027-04-25');
  const mp = race.days.find((d) => d.title === 'Kort marathontempo');
  assert.equal(weekday(mp.date), 2);
  assert.equal(race.days.filter(isRun).length, 3);
});

test('spinning telt niet mee als loopje of in het weekvolume', () => {
  const plan = buildPlan(LIVE);
  const w = plan.weeks[0];
  assert.equal(w.plannedKm, w.days.filter(isRun).reduce((a, d) => a + d.km, 0));
  const tue = w.days[TUESDAY].date;
  const m = matchRuns(plan, [], tue);
  const day = m.weeks[0].days[TUESDAY];
  assert.equal(day.status, 'rest');
  assert.equal(m.compliance, null, 'dinsdag telt niet in de naleving');
});
