import { describe, expect, it } from "vitest";
import { runRelat } from "../src/relat-run.js";
import { Relation } from "../src/souffle-run.js";

describe("runRelat", () => {
  it("basically works", async () => {
    const isPerson: Relation = { types: ["number"], tuples: [
      [10], [11], [12], [13], [20], [21], [22], [23], [30]
    ] };
    const hasChild: Relation = { types: ["number", "number"], tuples: [
      [10, 11],
      [10, 12],
      [10, 13],
      [20, 21],
      [20, 22],
      [20, 23]
    ] };
    const isHappy: Relation = { types: ["number"], tuples: [
      [11], [12], [13], [21], [22]
    ] };

    const hasChildRoundAbout = await runRelat(
      `{x : isPerson | some x.hasChild}`,
      { isPerson, hasChild, isHappy }
    );
    expect(hasChildRoundAbout).toEqual({ types: ["number"], tuples: [[10], [20]] })

    const hasSadChild = await runRelat(
      `{x : isPerson | some {y : x.hasChild | not y.isHappy}}`,
      { isPerson, hasChild, isHappy }
    );
    expect(hasSadChild).toEqual({ types: ["number"], tuples: [[20]] })

    const hasChildButNoSadChildren = await runRelat(
      `{x : isPerson | (some x.hasChild) & (not some {y : x.hasChild | not y.isHappy})}`,
      { isPerson, hasChild, isHappy }
    );
    expect(hasChildButNoSadChildren).toEqual({ types: ["number"], tuples: [[10]] })

  })
});
