import assert from 'node:assert/strict';

const tests = [];

export { assert };

export function test(name, fn) {
  tests.push({ name, fn });
}

export async function run() {
  let failed = 0;
  for (const item of tests) {
    try {
      await item.fn();
      console.log(`ok - ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${item.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  if (failed) {
    console.error(`${failed} test(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`${tests.length} test(s) passed`);
  }
}
