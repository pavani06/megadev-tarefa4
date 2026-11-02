import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).toEqual({
      night: '2026-10-28',
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
    });
  });

  it('reads runs/2026-10-27.jsonl: 4 jobs, no bad lines', () => {
    const night = readNight('runs', '2026-10-27');
    expect(night?.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(night?.badLines).toBe(0);
    expect(night?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });

  it('gives null for a night with no file', () => {
    expect(readNight(tempRuns({}), '2026-10-01')).toBeNull();
  });

  it('gives null for a night that is not YYYY-MM-DD', () => {
    const dir = tempRuns({ 'latest.jsonl': '', '2026-10-1.jsonl': '' });
    expect(readNight(dir, 'latest')).toBeNull();
    expect(readNight(dir, '2026-10-1')).toBeNull();
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
  });

  it('reads an empty file as an empty night', () => {
    expect(readNight(tempRuns({ '2026-10-01.jsonl': '' }), '2026-10-01')).toEqual({
      night: '2026-10-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts lines without a valid at, job, status or owner as bad; skips blank lines', () => {
    const text = [
      '{"at":"2026-10-01T23:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
      '',
      '   ',
      '{"job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-10-01T23:01:00+01:00","status":"ok","owner":"rook"}',
      '{"at":"2026-10-01T23:01:00+01:00","job":"a","status":"done","owner":"rook"}',
      '{"at":"2026-10-01T23:01:00+01:00","job":"a","status":"ok"}',
      '{"at":"2026-10-01T23:01:00+01:00","job":"a","status":"ok","owner":7}',
      '[1,2]',
      'null',
      '{"at":',
    ].join('\n');
    const night = readNight(tempRuns({ '2026-10-01.jsonl': text }), '2026-10-01');
    expect(night?.badLines).toBe(8);
    expect(night?.rows).toHaveLength(1);
    expect(night?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });
});
