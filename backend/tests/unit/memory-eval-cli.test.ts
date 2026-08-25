import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseArgs,
  valueAfterFlag,
  resultFileSlug,
  pickLatestResultFile,
  assertEmptyScope,
  assertFixtureOnlyScope,
} from '../../src/services/memory/eval/cli.mjs';

describe('eval CLI helpers', () => {
  it('parses --key=value and space-separated --key value', () => {
    expect(parseArgs(['report', '--in=results.json']).in).toBe('results.json');
    expect(parseArgs(['report', '--in', 'results.json']).in).toBe('results.json');
    expect(parseArgs(['sweep', '--scope', 'eval', '--limit', '5']).limit).toBe('5');
  });

  it('keeps the full --scope= value after additional equals signs', () => {
    expect(valueAfterFlag(['--scope=team=prod'], '--scope', 'eval')).toBe('team=prod');
  });

  it('encodes slashes in result filenames', () => {
    expect(resultFileSlug('a/b')).toBe('a%2Fb');
  });

  it('picks the newest result by mtime, including the checked-in baseline name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'memory-eval-'));
    const older = join(dir, 'results-z-limit5.json');
    const newer = join(dir, 'baseline-limit5.json');
    writeFileSync(older, '{}');
    writeFileSync(newer, '{}');
    utimesSync(older, new Date('2026-01-01'), new Date('2026-01-01'));
    utimesSync(newer, new Date('2026-08-01'), new Date('2026-08-01'));
    expect(pickLatestResultFile(dir)).toBe(newer);
  });

  it('rejects a nonempty seed scope and a polluted sweep scope', () => {
    expect(() => assertEmptyScope([{ title: 'x' }], 'eval')).toThrow(/already has/);
    const memories = [
      { id: 'm1', title: 'A' },
      { id: 'm2', title: 'B' },
    ];
    expect(() =>
      assertFixtureOnlyScope([{ title: 'A' }, { title: 'unrelated' }], memories, 'eval')
    ).toThrow(/not fixture-isolated/);
    expect(() => assertFixtureOnlyScope([{ title: 'A' }], memories, 'eval')).toThrow(/missing/);
    expect(() =>
      assertFixtureOnlyScope([{ title: 'A' }, { title: 'B' }], memories, 'eval')
    ).not.toThrow();
  });
});
