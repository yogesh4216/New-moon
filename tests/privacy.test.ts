import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');

test('CircuitCall never renders the private input back to the UI', () => {
  const src = read('./src/components/CircuitCall.tsx');

  // The input is write-only: `value={amount}` on the masked field is the only
  // legitimate binding. Any other `{amount}` interpolation would paint the
  // private value into the DOM.
  const leaked = /(?<!value=)\{\s*amount\s*\}/.exec(src);
  assert.equal(
    leaked,
    null,
    `the private \`amount\` must not be rendered into JSX (found: ${leaked?.[0]})`,
  );

  assert.ok(src.includes("type=\"password\""), 'private input should be masked');
  assert.ok(src.includes("setAmount('')"), 'private input should be cleared after the call');
});

test('no console logging of the private input anywhere in src/', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    });

  for (const file of walk(path.resolve('./src'))) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(
      !/console\.\w+\([^)]*\bamount\b/.test(src),
      `${path.relative(process.cwd(), file)} logs the private input`,
    );
  }
});

test('no wallet seeds are committed', () => {
  assert.ok(!fs.existsSync(path.resolve('./.midnight-state.json')) ||
    read('./.gitignore').includes('.midnight-state.json'),
    '.midnight-state.json must be gitignored — it holds wallet seeds');
});

test('the dApp reads its contract address from configuration, not a hardcoded literal', () => {
  const config = read('./src/config.ts');
  assert.ok(config.includes('VITE_CONTRACT_ADDRESS'), 'contract address should come from env');
});
