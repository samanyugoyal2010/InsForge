#!/usr/bin/env node
// Where do correct answers actually sit on the cosine scale?
//
// The sweep shows how F1 moves with threshold. This shows why: it prints the
// similarity the service assigns to each query's known-correct memory, so the
// threshold can be read directly off the distribution instead of inferred from
// the metric curve.
//
//   node calibrate.mjs [--scope=eval]
//
// Adapted from ssrajadh/insforge-memory-lab (Apache-2.0).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memory } from './client.mjs';
import { assertFixtureOnlyScope, valueAfterFlag } from './cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { memories, queries } = JSON.parse(
  readFileSync(resolve(HERE, 'fixtures/corpus.json'), 'utf8')
);

const scope = valueAfterFlag(process.argv, '--scope', 'eval');

const { entries } = await memory.index(scope);
assertFixtureOnlyScope(entries, memories, scope);

const titleToFixture = new Map(memories.map((m) => [m.title, m.id]));

const rows = [];
for (const q of queries.filter((x) => x.relevant.length)) {
  // Public recall() fuses at most 20 vector + 20 keyword hits. Request the
  // schema max so we see as much of that union as the API will return.
  const { memories: got } = await memory.recall({ scope, query: q.query, limit: 50, threshold: 0 });
  for (const relId of q.relevant) {
    const hit = got.find((m) => titleToFixture.get(m.title) === relId);
    rows.push({
      query: q.id,
      type: q.type,
      target: relId,
      similarity: hit ? hit.similarity : null,
      rank: hit ? got.findIndex((m) => titleToFixture.get(m.title) === relId) + 1 : null,
    });
  }
}

console.log('query  type      target  rank  cosine similarity');
console.log('─'.repeat(58));
for (const r of rows) {
  const bar =
    r.similarity === null
      ? '(not retrieved)'
      : '█'.repeat(Math.max(0, Math.round(r.similarity * 40)));
  console.log(
    `${r.query}   ${r.type.padEnd(9)} ${r.target}   ` +
      `${String(r.rank ?? '-').padEnd(5)} ${
        r.similarity === null ? '  —  ' : r.similarity.toFixed(3)
      } ${bar}`
  );
}

const withSim = rows.filter((r) => r.similarity !== null);
const missing = rows.filter((r) => r.similarity === null);
const byType = (t) => withSim.filter((r) => r.type === t).map((r) => r.similarity);
const stats = (xs) => {
  if (!xs.length) {
    return 'none';
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return `min ${Math.min(...xs).toFixed(3)}  median ${median.toFixed(3)}  max ${Math.max(...xs).toFixed(3)}`;
};

console.log(`\nlexical  targets: ${stats(byType('lexical'))}`);
console.log(`semantic targets: ${stats(byType('semantic'))}`);
if (missing.length) {
  console.log(
    `${missing.length} labeled target(s) were outside the fused recall window ` +
      `(each arm caps at 20). They are omitted from threshold-cut percentages.`
  );
}

for (const t of [0.35, 0.4, 0.45, 0.5]) {
  if (!withSim.length) {
    console.log(`threshold ${t}: no retrieved labeled targets to cut`);
    continue;
  }
  const cut = withSim.filter((r) => r.similarity <= t).length;
  console.log(
    `threshold ${t}: cuts ${cut}/${withSim.length} retrieved correct answers from the vector arm ` +
      `(${((cut / withSim.length) * 100).toFixed(0)}%)`
  );
}
