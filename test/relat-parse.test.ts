import { describe, expect, it } from "vitest";
import { parseRelat } from "../src/relat-parse.js";
import { Expression, o, stripMeta } from "../src/relat.js";


describe("parseRelat", () => {
  const x: Expression<{}> = { type: "identifier", name: "x" };
  const y: Expression<{}> = { type: "identifier", name: "y" };
  const z: Expression<{}> = { type: "identifier", name: "z" };

  const expectedParsings: [string, Expression<{}>][] = [
    // TODO: these used to be in correct precedence group but then we reordered
    // precedence. idk.

    // E1
    ["some x", o("some", x)],
    ["not x", o("not", x)],
    // E2
    ["x = y", o("=", x, y)],
    ["x < y", o("<", x, y)],
    ["x > y", o(">", x, y)],
    ["x =< y", o("=<", x, y)],
    ["x >= y", o(">=", x, y)],
    // E3
    ["x ; y", o(";", x, y)],
    ["x ; y ; z", o(";", o(";", x, y), z)],
    // E4
    ["#x", o("#", x)],
    // E4b
    ["x & y", o("&", x, y)],
    ["x & y & z", o("&", o("&", x, y), z)],
    // E5
    ["x . y", o(".", x, y)],
    ["x . y . z", o(".", o(".", x, y), z)],
    // E6
    ["^x", o("^", x)],
    ["*x", o("*", x)],
    ["~x", o("~", x)],
    ["let x = y | z", { type: "let", variable: "x", value: y, body: z }],
    ["(x)", x],
    ["{ x : y | z }", { type: "comprehension", variable: "x", constraint: y, body: z }],
    ["100", { type: "constant", value: 100 }],
    ["'str'", { type: "constant", value: "str" }],
    ["\"str\"", { type: "constant", value: "str" }],
    ["iden", { type: "identifier", name: "iden" }],
    ["`3 * x`", { type: "formula", formula: "3 * x" }],
    // NEW
    ["x[y]", o("[]", x, y)],
    ["x-y", o("-", x, y)],
    ["min x", o("min", x)],
    ["max x", o("max", x)],
    ["sum x", o("sum", x)],
    ["Σx", o("sum", x)],
    ["x[_]", o("[_]", x)],
    ["x <: y", o("<:", x, y)],
    ["x :> y", o(":>", x, y)],

    // compounds
    ["some not x", o("some", o("not", x))],
    ["not some x", o("not", o("some", x))],
    ["*x;y", o(";", o("*", x), y)],
    ["*x.y", o(".", o("*", x), y)],
    ["#x.y", o("#", o(".", x, y))],
    ["some x.y", o("some", o(".", x, y))],
    ["some x & y", o("&", o("some", x), y)],
    ["x[y.z]", o("[]", x, o(".", y, z))],
    ["x[y;z]", o("[]", x, o(";", y, z))],
    ["some x[y]", o("some", o("[]", x, y))],
    ["x.y[z]", o("[]", o(".", x, y), z)],
    ["x[y][z]", o("[]", o("[]", x, y), z)],
    ["x[y].z", o(".", o("[]", x, y), z)],
    ["x-y-z", o("-", o("-", x, y), z)],
    ["Σ x.y", o("sum", o(".", x, y))],
    ["#x > y", o(">", o("#", x), y)],
    ["x[_].y", o(".", o("[_]", x), y)],
    ["x[_][y]", o("[]", o("[_]", x), y)],
    ["x[y][_]", o("[_]", o("[]", x, y))],
    ["x.y[_]", o("[_]", o(".", x, y))],
    ["#x.y > #x.y.z", o(">", o("#", o(".", x, y)), o("#", o(".", o(".", x, y), z)))],
    ["x.y <: z", o("<:", o(".", x, y), z)],
  ];

  for (const [input, expected] of expectedParsings) {
    it(`parses ${input}`, () => {
      expect(stripMeta(parseRelat(input))).toEqual(expected);
    });
  }
});

describe("stripMeta", () => {
  it("basically works", () => {
    expect(
      stripMeta({ type: "constant", value: 1, range: { source: "", start: 0, end: 1 }})
    ).toEqual(
      { type: "constant", value: 1 }
    )
  });
});
