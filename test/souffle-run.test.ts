import { describe, expect, it } from "vitest";
import { Relation, runSouffle } from "../src/souffle-run.js";
import { runSouffleInWorker } from "../src/souffle-run-in-worker.js";

describe('runSouffle', () => {
  it('can run ok', async () => {
    const result = await runSouffle("", {});
    expect(result).toEqual({});
  });

  it('reports errors', async () => {
    await expect(async () => {
      const result = await runSouffle("bogus code that shouldn't work", {});
      console.log("hi", result);
    }).rejects.toThrow();
  });

  it('can run a simple program', async () => {
    const result = await runSouffle(`
      .decl isNiceNumber(x : number)

      isNiceNumber(10).
      isNiceNumber(20).

      .decl isGreatNumber(x : number)
      isGreatNumber(y) :- isNiceNumber(x), y = 2 * x.

      .output isGreatNumber
    `, {});
    expect(result).toEqual({isGreatNumber: {types: ['number'], tuples: [[20], [40]]}});
  });

  it('can run a simple program with input', async () => {
    const isNiceNumber: Relation = { types: ['number'], tuples: [[10], [20]] };
    const result = await runSouffle(`
      .decl isNiceNumber(x : number)

      .input isNiceNumber

      .decl isGreatNumber(x : number)
      isGreatNumber(y) :- isNiceNumber(x), y = 2 * x.

      .output isGreatNumber
    `, { isNiceNumber });
    expect(result).toEqual({ isGreatNumber: { types: ['number'], tuples: [[20], [40]] } });
  });
});

describe('runSouffleInWorker', () => {
  // TODO: no web workers in node
  it.fails('can run ok', async () => {
    const result = await runSouffleInWorker("", {});
    expect(result).toEqual({});
  });
});
