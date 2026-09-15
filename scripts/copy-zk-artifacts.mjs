// Copies the compiled ZK artifacts into public/ so the browser can fetch the
// prover/verifier keys and ZKIR at runtime. FetchZkConfigProvider expects the
// layout <base>/keys/<circuit>.{prover,verifier} and <base>/zkir/<circuit>.bzkir,
// which is exactly how `compact compile` lays out managed/.
import { cp, mkdir, rm, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'managed');
const dest = resolve(root, 'public', 'managed');

try {
  await access(src);
} catch {
  console.error(`[zk-artifacts] missing ${src} — run "npm run compile" first.`);
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dirname(dest), { recursive: true });

for (const sub of ['keys', 'zkir']) {
  await cp(resolve(src, sub), resolve(dest, sub), { recursive: true });
}

console.log(`[zk-artifacts] copied keys/ and zkir/ -> public/managed/`);
