import { describe, expect, it } from "vitest";
import { programToString } from "../src/dl.js";
import { Relation, runSouffle } from "../src/souffle-run.js";

describe('dl', () => {
  it('basically works', async () => {
    const isNiceNumber: Relation = { types: ['number'], tuples: [[10], [20]] };
    const code = programToString([
      { type: 'decl', relName: 'isNiceNumber', sig: [{ name: 'x', type: 'number' }] },
      { type: 'input', relName: 'isNiceNumber' },
      { type: 'decl', relName: 'isGreatNumber', sig: [{ name: 'x', type: 'number' }] },
      {
        type: 'rule',
        head: { relName: 'isGreatNumber', args: ['y'] },
        body: [
          { relName: 'isNiceNumber', args: ['x'] },
          'y = 2 * x',
        ],
      },
      { type: 'output', relName: 'isGreatNumber' },
    ]);
    const result = await runSouffle(code, { isNiceNumber });
    expect(result).toEqual({ isGreatNumber: { types: ['number'], tuples: [[20], [40]] } });
  })
});
