import { describe, expect, it } from "vitest";
import { runRelat } from "../src/relat-run.js";
import { Relation } from "../src/souffle-run.js";

describe("runRelat", () => {
  const TRUE: Relation = { types: [], tuples: [[]] };
  const FALSE: Relation = { types: [], tuples: [] };

  it("numeric constants", async () => {
    const output = await runRelat("100", {});
    expect(output).toEqual({ types: ["number"], tuples: [[100]] });
  });

  it("string constants", async () => {
    const output = await runRelat("'str'", {});
    expect(output).toEqual({ types: ["symbol"], tuples: [["str"]] });
  });

  it("relation identifiers", async () => {
    const rel: Relation = { types: ["number"], tuples: [[100], [200]] };
    const output = await runRelat("rel", { rel });
    expect(output).toEqual(rel);
  });

  it("union", async () => {
    const rel1: Relation = { types: ["number"], tuples: [[100], [200]] };
    const rel2: Relation = { types: ["number"], tuples: [[200], [300]] };
    const output = await runRelat("rel1 ; rel2", { rel1, rel2 });
    expect(output).toEqual({ types: ["number"], tuples: [[100], [200], [300]] });
  });

  it("intersection", async () => {
    const rel1: Relation = { types: ["number"], tuples: [[100], [200]] };
    const rel2: Relation = { types: ["number"], tuples: [[200], [300]] };
    const output = await runRelat("rel1 & rel2", { rel1, rel2 });
    expect(output).toEqual({ types: ["number"], tuples: [[200]] });
  });

  it("cartesian product", async () => {
    const rel1: Relation = { types: ["number"], tuples: [[100], [200]] };
    const rel2: Relation = { types: ["number"], tuples: [[200], [300]] };
    const output = await runRelat("rel1 , rel2", { rel1, rel2 });
    expect(output).toEqual({ types: ["number", "number"], tuples: [[100, 200], [100, 300], [200, 200], [200, 300]] });
  });

  it("silly formulas", async () => {
    const output = await runRelat("`3 * 4`", {});
    expect(output).toEqual({ types: ["number"], tuples: [[12]] });
  });

  it("comprehension", async () => {
    const rel: Relation = { types: ["number"], tuples: [[100], [200], [300]] };
    const output = await runRelat("{x : rel | x > 150}", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[200], [300]] });
  });

  it("comprehension with formula", async () => {
    const rel: Relation = { types: ["number"], tuples: [[100], [200], [300]] };
    const output = await runRelat("{x : rel | `x * 3`}", { rel });
    expect(output).toEqual({ types: ["number", "number"], tuples: [[100, 300], [200, 600], [300, 900]] });
  });

  it("comprehension with formula and let", async () => {
    const rel: Relation = { types: ["number"], tuples: [[100], [200], [300]] };
    const output = await runRelat("{x : rel | let y = `x * 3` | y > 450}", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[200], [300]] });
  });

  it("some (positive)", async () => {
    const rel: Relation = { types: ["number"], tuples: [[100]] };
    const output = await runRelat("some rel", { rel });
    expect(output).toEqual(TRUE);
  });

  it("some (negative)", async () => {
    const rel: Relation = { types: ["number"], tuples: [] };
    const output = await runRelat("some rel", { rel });
    expect(output).toEqual(FALSE);
  });

  it("application, single argument", async () => {
    const rel: Relation = { types: ["number", "number"], tuples: [[100, 1], [200, 2]] };
    const output = await runRelat("rel[100]", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[1]] });
  });

  it("application, union argument", async () => {
    const rel: Relation = { types: ["number", "number"], tuples: [[100, 1], [200, 2]] };
    const output = await runRelat("rel[150; 200]", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[2]] });
  });

  it("application, product argument", async () => {
    const rel: Relation = { types: ["number", "number"], tuples: [[100, 1], [200, 2]] };
    const output1 = await runRelat("rel[100, 1]", { rel });
    expect(output1).toEqual(TRUE);
    const output2 = await runRelat("rel[100, 2]", { rel });
    expect(output2).toEqual(FALSE);
  });

  it("application, repeated", async () => {
    const rel: Relation = { types: ["number", "number"], tuples: [[100, 1], [200, 2]] };
    const output1 = await runRelat("rel[100][1]", { rel });
    expect(output1).toEqual(TRUE);
    const output2 = await runRelat("rel[100][2]", { rel });
    expect(output2).toEqual(FALSE);
  });

  it("difference", async () => {
    const rel1: Relation = { types: ["number"], tuples: [[100], [200]] };
    const rel2: Relation = { types: ["number"], tuples: [[200], [300]] };
    const output = await runRelat("rel1 - rel2", { rel1, rel2 });
    expect(output).toEqual({ types: ["number"], tuples: [[100]] });
  });

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
  });

  // TODO: test every single operator, lol
});
