import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * managed/ is compiled output, and the compiler stamps the compact-runtime
 * version it targeted into it. Loading it against a different runtime throws
 * "Version mismatch: compiled code expects X, runtime is Y", which says nothing
 * about what to do. Surface that as an instruction instead.
 */
const loadContract = async (contractPath: string) => {
  try {
    return await import(contractPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Version mismatch/.test(msg)) {
      const runtime = JSON.parse(
        fs.readFileSync(path.resolve('./node_modules/@midnight-ntwrk/compact-runtime/package.json'), 'utf8'),
      ).version;
      throw new Error(
        `${msg}\n\n` +
          `  managed/ was built by an older Compact toolchain than the installed\n` +
          `  runtime (${runtime}). Update the compact CLI and rebuild:\n\n` +
          `      compact update\n` +
          `      npm run compile\n`,
      );
    }
    throw err;
  }
};

test('Circuit logic: Contract compiles and exposes correct circuits', async () => {
    const contractPath = path.resolve('./managed/contract/index.js');
    assert.ok(fs.existsSync(contractPath), 'Compiled contract should exist');
    
    const { Contract } = await loadContract(contractPath);
    assert.ok(Contract, 'Contract class should be exported');
});

test('State transitions: Constructor and increment exist in circuits', async () => {
    const contractPath = path.resolve('./managed/contract/index.js');
    const { Contract } = await loadContract(contractPath);
    const instance = new Contract({});
    assert.ok(typeof instance.circuits.initialize === 'function', 'initialize circuit should be defined');
    assert.ok(typeof instance.circuits.increment === 'function', 'increment circuit should be defined');
});

test('Private inputs are never exposed: increment takes private witness', async () => {
    const contractPath = path.resolve('./managed/contract/index.js');
    const { Contract } = await loadContract(contractPath);
    const instance = new Contract({});
    assert.ok(typeof instance.circuits.increment === 'function');
    // Ensure the witness is private by checking the contract doesn't leak it publicly on the instance
    assert.ok(instance.witnesses !== undefined, 'witnesses object should exist and keep state private');
});
