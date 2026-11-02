// src/digest/types.ts
export type JobStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;      // owner of the job's last valid line; null renders as —
  runs: number;              // valid lines of this job
  retries: number;           // lines of this job with status retry
  lastStatus: JobStatus;     // status of the job's last valid line
  lastError: string | null;  // last error seen in the job's lines, even after a later ok; null renders as —
  firstAt: string;           // `at` exactly as in the log (offset kept)
  lastAt: string;
};

export type Night = {
  night: string;
  rows: DigestRow[];                  // sorted by job
  badLines: number;                   // lines that do not parse, counted, never thrown
  counts: Record<JobStatus, number>;  // valid lines per status
};

// null when `night` is not YYYY-MM-DD (same pattern as src/status.ts:16) or <runsDir>/<night>.jsonl does not exist.
// An empty file gives rows: [], badLines: 0, counts all 0.
export type ReadNight = (runsDir: string, night: string) => Night | null;
