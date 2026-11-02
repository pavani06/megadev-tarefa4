import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

const normal = [
  line({ at: '2026-10-29T01:30:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: '2026-10-29T01:31:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: '2026-10-29T01:32:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: '2026-10-29T01:37:00+01:00', job: 'fixtures/refresh', status: 'ok', owner: 'rook' }),
  line({ at: '2026-10-29T05:41:09+01:00', job: 'digest/render', status: 'ok', owner: null }),
  line({ at: '2026-10-29T04:00:01+01:00', job: 'notes/backup', status: 'fail', owner: 'lane-07', error: 'quota exceeded' }),
].join('\n');

let runsDir = '';
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(runsDir, '2026-01-01.jsonl'), normal + '\n');
  writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');
  writeFileSync(join(runsDir, '2026-01-03.jsonl'), normal + '\n{"at": "2026-10-29T05:00:00+01:00", "job": "cut\n');
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders a normal night sorted by job, with warn rows and — for a null owner', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    const jobs = ['digest/render', 'fixtures/refresh', 'notes/backup'].map((j) => html.indexOf(j));
    expect(jobs.every((i) => i >= 0)).toBe(true);
    expect(jobs).toEqual([...jobs].sort((a, b) => a - b));
    expect(html.match(/class="warn"/g)).toHaveLength(2);
    expect(html).toContain('—');
    expect(html).toContain('2026-10-29T05:41:09+01:00');
    expect(html).toContain('bad lines: 0');
  });

  it('answers 404 for a night with no file', async () => {
    expect((await app.request('/digest/2026-02-02')).status).toBe(404);
  });

  it('answers 404 for a night that is not YYYY-MM-DD', async () => {
    expect((await app.request('/digest/tomorrow')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('counts a bad line and still renders the night', async () => {
    const res = await app.request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('fixtures/refresh');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the whole night as JSON with nulls kept', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'fixtures/refresh', 'notes/backup']);
    expect(body.rows[0]).toMatchObject({ owner: null, lastError: null, runs: 1, retries: 0, lastStatus: 'ok' });
    expect(body.rows[1]).toMatchObject({
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 3, fail: 1 });
  });

  it('answers 404 with an error body for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-02-02');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns no rows for an empty night', async () => {
    const res = await app.request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts a bad line and keeps the valid rows', async () => {
    const res = await app.request('/api/digest/2026-01-03');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(3);
  });

  it('lists the same jobs in the same order as the page', async () => {
    const page = await (await app.request('/digest/2026-01-01')).text();
    const body = (await (await app.request('/api/digest/2026-01-01')).json()) as Night;
    const positions = body.rows.map((r) => page.indexOf(r.job));
    expect(positions.every((i) => i >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
