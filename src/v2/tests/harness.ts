/**
 * harness.ts — Minimal deterministic test harness (node, no dependencies).
 */

declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void };

export interface TestCase {
  name: string;
  fn: () => void;
}

const tests: TestCase[] = [];

export function test(name: string, fn: () => void): void {
  tests.push({ name, fn });
}

export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

export function assertEq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

export function assertClose(actual: number, expected: number, eps: number, msg: string): void {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg}\n  expected ≈ ${expected}\n  actual:    ${actual}`);
  }
}

export function runAll(): number {
  let failed = 0;
  let passed = 0;
  for (const t of tests) {
    try {
      t.fn();
      passed++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL  ${t.name}\n      ${msg.replace(/\n/g, '\n      ')}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
  return failed;
}
