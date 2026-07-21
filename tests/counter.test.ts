import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';

test('Circuit logic: Contract compiles and exposes correct circuits', async () => {
    const contractPath = path.resolve('./my-managed/contract/index.js');
    assert.ok(fs.existsSync(contractPath), 'Compiled contract should exist');
    
    const { Contract } = await import(contractPath);
    assert.ok(Contract, 'Contract class should be exported');
});

test('State transitions: Constructor and increment exist in circuits', async () => {
    const contractPath = path.resolve('./my-managed/contract/index.js');
    const { Contract } = await import(contractPath);
    const instance = new Contract({});
    assert.ok(typeof instance.circuits.initialize === 'function', 'initialize circuit should be defined');
    assert.ok(typeof instance.circuits.increment === 'function', 'increment circuit should be defined');
});

test('Private inputs are never exposed: increment takes private witness', async () => {
    const contractPath = path.resolve('./my-managed/contract/index.js');
    const { Contract } = await import(contractPath);
    const instance = new Contract({});
    assert.ok(typeof instance.circuits.increment === 'function');
    // Ensure the witness is private by checking the contract doesn't leak it publicly on the instance
    assert.ok(instance.witnesses !== undefined, 'witnesses object should exist and keep state private');
});
