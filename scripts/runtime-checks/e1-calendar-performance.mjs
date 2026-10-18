import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyCalendarPerformance({ runtime, output, start, end, ownIds, teamIds }) {
  const { api, check, sessions } = runtime;
  const sameIds = (records, expected) => JSON.stringify(records.map(record => record.activityId).sort((left, right) => left - right))
    === JSON.stringify([...expected].sort((left, right) => left - right));
  const parameters = { start, end, ownerId: sessions.sales.identity.userId, pageNum: 1, pageSize: 100 };
  const requestPath = '/crm/activity/calendar?' + new URLSearchParams(parameters);
  const samples = [];
  for (let sample = 0; sample < 31; sample++) {
    const began = performance.now();
    const response = await api('sales', requestPath);
    const durationMs = performance.now() - began;
    check('calendar_sample_' + sample + '_successful', response.status === 200 && response.body?.code === 200);
    check('calendar_sample_' + sample + '_complete_scope', response.body.data.total === ownIds.length && sameIds(response.body.data.rows, ownIds));
    samples.push({ sample, durationMs, rows: response.body.data.rows.length, status: response.status, code: response.body.code });
    if (sample < 30) await new Promise(resolve => setTimeout(resolve, 400));
  }
  const ordered = samples.map(sample => sample.durationMs).sort((left, right) => left - right);
  const measured = {
    passed: samples.every(sample => sample.durationMs < 200),
    limitMs: 200, sampleCount: samples.length, firstMs: samples[0].durationMs,
    medianMs: ordered[Math.floor(ordered.length / 2)], p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
    maximumMs: ordered.at(-1), ownActivities: ownIds.length, teamActivities: teamIds.length,
    requestPath, timing: 'Complete browser request through local Vite proxy and real gateway; includes response parsing and automation transfer',
    warmupRequests: 0, restartedServices: false, firstAfterProcessStart: false, samples,
  };
  await fs.writeFile(path.join(output, 'calendar-performance.json'), JSON.stringify(measured, null, 2), { flag: 'wx' });
  const collected = [];
  const pageSize = 7;
  for (let pageNum = 1; pageNum <= Math.ceil(teamIds.length / pageSize); pageNum++) {
    const response = await api('admin', '/crm/activity/calendar?' + new URLSearchParams({ start, end, pageNum, pageSize }));
    check('calendar_team_page_' + pageNum + '_successful', response.status === 200 && response.body?.code === 200);
    check('calendar_team_page_' + pageNum + '_total', response.body.data.total === teamIds.length);
    collected.push(...response.body.data.rows);
  }
  check('calendar_team_pagination_complete', sameIds(collected, teamIds));
  check('calendar_team_pagination_unique', new Set(collected.map(record => record.activityId)).size === teamIds.length);
  const foreign = await api('foreign', requestPath);
  check('calendar_other_tenant_owner_empty', foreign.status === 200 && foreign.body?.code === 200 && foreign.body.data.total === 0 && foreign.body.data.rows.length === 0);
  const reversed = await api('sales', '/crm/activity/calendar?' + new URLSearchParams({ start: end, end: start, ownerId: sessions.sales.identity.userId }));
  check('calendar_reversed_range_rejected', reversed.status === 400 && reversed.body?.code === 400);
  return measured;
}
