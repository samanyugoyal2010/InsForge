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

const HERE = dirname(fileURLToPath(import.meta.url));
const { memories, queries } = JSON.parse(
  readFileSync(resolve(HERE, 'fixtures/corpus.json'), 'utf8')
);

const scopeArg = process.argv.find((a) => a.startsWith('--scope='));
const scope = scopeArg ? scopeArg.split('=')[1] : 'eval';

const titleToFixture = new Map(memories.map((m) => [m.title, m.id]));

const rows = [];
for (const q of queries.filter((x) => x.relevant.length)) {
  // threshold 0 + a wide limit: see the ranking before any cutoff applies.
  const { memories: got } = await memory.recall({ scope, query: q.query, limit: 20, threshold: 0 });
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
  const bar = r.similarity === null ? '(not retrieved)' : '█'.repeat(Math.round(r.similarity * 40));
  console.log(
    `${r.query}   ${r.type.padEnd(9)} ${r.target}   ` +
      `${String(r.rank ?? '-').padEnd(5)} ${
        r.similarity === null ? '  —  ' : r.similarity.toFixed(3)
      } ${bar}`
  );
}

const withSim = rows.filter((r) => r.similarity !== null);
const byType = (t) => withSim.filter((r) => r.type === t).map((r) => r.similarity);
const stats = (xs) =>
  xs.length
    ? `min ${Math.min(...xs).toFixed(3)}  median ${xs
        .slice()
        .sort((a, b) => a - b)
        [Math.floor(xs.length / 2)].toFixed(3)}  max ${Math.max(...xs).toFixed(3)}`
    : 'none';

console.log(`\nlexical  targets: ${stats(byType('lexical'))}`);
console.log(`semantic targets: ${stats(byType('semantic'))}`);

for (const t of [0.35, 0.4, 0.45, 0.5]) {
  const cut = withSim.filter((r) => r.similarity <= t).length;
  console.log(
    `threshold ${t}: cuts ${cut}/${withSim.length} correct answers from the vector arm ` +
      `(${((cut / withSim.length) * 100).toFixed(0)}%)`
  );
}
