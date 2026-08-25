import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Parse argv tokens. Supports `--key=value` and `--key value`.
 * @param {string[]} argv typically `process.argv.slice(2)`
 */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const eq = token.match(/^--([^=]+)=(.*)$/);
    if (eq) {
      out[eq[1]] = eq[2];
      continue;
    }
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
      continue;
    }
    out._.push(token);
  }
  return out;
}

/** Value after `--flag=` without truncating on later `=` characters. */
export function valueAfterFlag(argv, flag, fallback) {
  const prefix = `${flag}=`;
  const token = argv.find((a) => a.startsWith(prefix));
  return token ? token.slice(prefix.length) : fallback;
}

/** Safe filename fragment for a memory scope that may contain `/`. */
export function resultFileSlug(scope) {
  return encodeURIComponent(scope);
}

/**
 * Prefer a generated sweep (`results-*.json`) by mtime. Use the checked-in
 * aggregates baseline only when no live sweep file exists (clean checkout).
 */
export function pickLatestResultFile(resultsDir) {
  const names = readdirSync(resultsDir);
  const sweeps = names.filter((name) => name.startsWith('results-') && name.endsWith('.json'));
  if (sweeps.length) {
    sweeps.sort(
      (left, right) =>
        statSync(resolve(resultsDir, right)).mtimeMs - statSync(resolve(resultsDir, left)).mtimeMs
    );
    return resolve(resultsDir, sweeps[0]);
  }
  if (names.includes('baseline-limit5.json')) {
    return resolve(resultsDir, 'baseline-limit5.json');
  }
  throw new Error(`no sweep results in ${resultsDir} — run: node harness.mjs sweep`);
}

/**
 * Rows the vector arm can admit at threshold 0 (`similarity > 0`).
 * Keyword-only fused hits get a fallback cosine that can be ≤ 0 and are not
 * dropped by raising DEFAULT_RECALL_THRESHOLD.
 */
export function vectorEligibleRows(rows) {
  return rows.filter((row) => row.similarity !== null && row.similarity > 0);
}

export function assertEmptyScope(entries, scope) {
  if (entries.length) {
    throw new Error(
      `scope "${scope}" already has ${entries.length} memor${entries.length === 1 ? 'y' : 'ies'}. ` +
        `Seed into a fresh, empty scope so title collisions cannot pollute labels.`
    );
  }
}

/**
 * Sweep/calibrate require a scope that contains exactly the fixture titles —
 * no extras (unrelated rows scoring as fixtures) and no missing fixtures.
 */
export function assertFixtureOnlyScope(entries, memories, scope) {
  if (!entries.length) {
    throw new Error(`scope "${scope}" is empty — run: node harness.mjs seed --scope=${scope}`);
  }
  const fixtureTitles = memories.map((m) => m.title);
  if (new Set(fixtureTitles).size !== fixtureTitles.length) {
    throw new Error('fixture corpus has duplicate titles; labels would be ambiguous');
  }
  const fixtureSet = new Set(fixtureTitles);
  const extras = entries.filter((entry) => !fixtureSet.has(entry.title));
  if (extras.length) {
    throw new Error(
      `scope "${scope}" is not fixture-isolated (${extras.length} unrelated title` +
        `${extras.length === 1 ? '' : 's'}). Seed a fresh empty scope.`
    );
  }
  const stored = new Set(entries.map((entry) => entry.title));
  if (stored.size !== entries.length) {
    throw new Error(`scope "${scope}" has duplicate titles; cannot map rows to fixtures`);
  }
  const missing = memories.filter((m) => !stored.has(m.title));
  if (missing.length) {
    throw new Error(
      `scope "${scope}" is missing ${missing.length} fixture title(s) ` +
        `(reconcile may have merged them). Seed a fresh empty scope.`
    );
  }
}
