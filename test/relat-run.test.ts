import { describe, expect, it } from "vitest";
import { simpleFamily } from "../src/client/scenarios.js";
import { runRelat } from "../src/relat-run.js";
import { Relation, emptyLike, inferTypes } from "../src/souffle-run.js";

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

  it("prefix join, single argument", async () => {
    const rel = inferTypes([[100, 1], [200, 2]]);
    const output = await runRelat("100 <: rel", { rel });
    expect(output).toEqual(inferTypes([[100, 1]]));
  });

  it("prefix join, union argument", async () => {
    const rel = inferTypes([[100, 1], [200, 2]]);
    const output = await runRelat("(150; 200) <: rel", { rel });
    expect(output).toEqual(inferTypes([[200, 2]]));
  });

  it("prefix join, product argument", async () => {
    const rel = inferTypes([[100, 1], [200, 2]]);
    const output1 = await runRelat("(100, 1) <: rel", { rel });
    expect(output1).toEqual(inferTypes([[100, 1]]));
    const output2 = await runRelat("(100, 2) <: rel", { rel });
    expect(output2).toEqual(emptyLike(rel));
  });

  it("suffix join, single argument", async () => {
    const rel = inferTypes([[100, 1], [200, 2]]);
    const output = await runRelat("rel :> 1", { rel });
    expect(output).toEqual(inferTypes([[100, 1]]));
  });

  it("suffix join, union argument", async () => {
    const rel = inferTypes([[100, 1], [200, 2]]);
    const output = await runRelat("rel :> (2; 3)", { rel });
    expect(output).toEqual(inferTypes([[200, 2]]));
  });

  it("suffix join, product argument", async () => {
    const rel = inferTypes([[100, 1], [200, 2]]);
    const output1 = await runRelat("rel :> (100, 1)", { rel });
    expect(output1).toEqual(inferTypes([[100, 1]]));
    const output2 = await runRelat("rel :> (100, 2)", { rel });
    expect(output2).toEqual(emptyLike(rel));
  });

  it("difference", async () => {
    const rel1: Relation = { types: ["number"], tuples: [[100], [200]] };
    const rel2: Relation = { types: ["number"], tuples: [[200], [300]] };
    const output = await runRelat("rel1 - rel2", { rel1, rel2 });
    expect(output).toEqual({ types: ["number"], tuples: [[100]] });
  });

  it("min", async () => {
    const rel: Relation = { types: ["symbol", "number"], tuples: [["x", 100], ["y", 100], ["z", 200]] };
    const output = await runRelat("min rel", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[100]] });
  });

  it("max", async () => {
    const rel: Relation = { types: ["symbol", "number"], tuples: [["x", 100], ["y", 100], ["z", 200]] };
    const output = await runRelat("max rel", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[200]] });
  });

  it("sum", async () => {
    const rel: Relation = { types: ["symbol", "number"], tuples: [["x", 100], ["y", 100], ["z", 200]] };
    const output = await runRelat("Σrel", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[400]] });
  });

  it("empty sum", async () => {
    const rel: Relation = { types: ["symbol", "number"], tuples: [] };
    const output = await runRelat("Σrel", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[0]] });
  });

  it("wildcard application", async () => {
    const rel: Relation = { types: ["number", "number"], tuples: [[100, 1], [200, 2]] };
    const output = await runRelat("rel[_]", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[1], [2]] });
  });

  it("prefix wildcard dot-join", async () => {
    const rel: Relation = { types: ["number", "number"], tuples: [[100, 1], [200, 2]] };
    const output = await runRelat("_.rel", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[1], [2]] });
  });

  it("suffix wildcard dot-join", async () => {
    const rel: Relation = { types: ["number", "number"], tuples: [[100, 1], [200, 2]] };
    const output = await runRelat("rel._", { rel });
    expect(output).toEqual({ types: ["number"], tuples: [[100], [200]] });
  });

  it("basically works", async () => {
    // NOTE: One important thing this tests is nested comprehensions, which can
    // actually go wrong in interesting ways. Please keep that around.

    const hasChildRoundAbout = await runRelat(
      `{x : isPerson | some x.hasChild}`,
      simpleFamily.inputs
    );
    expect(hasChildRoundAbout).toEqual({ types: ["number"], tuples: [[10], [20]] });

    const hasSadChild = await runRelat(
      `{x : isPerson | some {y : x.hasChild | not y.isHappy}}`,
      simpleFamily.inputs
    );
    expect(hasSadChild).toEqual({ types: ["number"], tuples: [[20]] });

    const hasChildButNoSadChildren = await runRelat(
      `{x : isPerson | (some x.hasChild) & (not some {y : x.hasChild | not y.isHappy})}`,
      simpleFamily.inputs
    );
    expect(hasChildButNoSadChildren).toEqual({ types: ["number"], tuples: [[10]] });

    const hasSadChild2 = await runRelat(
      `{ x : isPerson | #x.hasChild > #(x.hasChild & isHappy) }`,
      simpleFamily.inputs
    );
    expect(hasSadChild2).toEqual({ types: ["number"], tuples: [[20]] });

    const hasSadChild3 = await runRelat(
      `{ x : isPerson | some (x.hasChild - isHappy)}`,
      simpleFamily.inputs
    );
    expect(hasSadChild3).toEqual({ types: ["number"], tuples: [[20]] });
  });
});
