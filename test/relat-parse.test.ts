import { describe, expect, it } from "vitest";
import { parseRelat } from "../src/relat-parse.js";
import { Expression, stripMeta } from "../src/relat.js";

describe("parseRelat", () => {
  const x: Expression<{}> = { type: "identifier", name: "x" };
  const y: Expression<{}> = { type: "identifier", name: "y" };
  const z: Expression<{}> = { type: "identifier", name: "z" };

  const expectedParsings: [string, Expression<{}>][] = [
    // TODO: these used to be in correct precedence group but then we reordered
    // precedence. idk.

    // E1
    ["some x", { type: "unary", op: "some", operand: x }],
    ["not x", { type: "unary", op: "not", operand: x }],
    // E2
    ["x = y", { type: "binary", op: "=", left: x, right: y }],
    ["x < y", { type: "binary", op: "<", left: x, right: y }],
    ["x > y", { type: "binary", op: ">", left: x, right: y }],
    ["x =< y", { type: "binary", op: "=<", left: x, right: y }],
    ["x >= y", { type: "binary", op: ">=", left: x, right: y }],
    // E3
    ["x ; y", { type: "binary", op: ";", left: x, right: y }],
    ["x ; y ; z", { type: "binary", op: ";", left: { type: "binary", op: ";", left: x, right: y }, right: z }],
    // E4
    ["#x", { type: "unary", op: "#", operand: x }],
    // E4b
    ["x & y", { type: "binary", op: "&", left: x, right: y }],
    ["x & y & z", { type: "binary", op: "&", left: { type: "binary", op: "&", left: x, right: y }, right: z }],
    // E5
    ["x . y", { type: "binary", op: ".", left: x, right: y }],
    ["x . y . z", { type: "binary", op: ".", left: { type: "binary", op: ".", left: x, right: y }, right: z }],
    // E6
    ["^x", { type: "unary", op: "^", operand: x }],
    ["*x", { type: "unary", op: "*", operand: x }],
    ["~x", { type: "unary", op: "~", operand: x }],
    ["let x = y | z", { type: "let", variable: "x", value: y, body: z }],
    ["(x)", x],
    ["{ x : y | z }", { type: "comprehension", variable: "x", constraint: y, body: z }],
    ["100", { type: "constant", value: 100 }],
    ["'str'", { type: "constant", value: "str" }],
    ["\"str\"", { type: "constant", value: "str" }],
    ["iden", { type: "identifier", name: "iden" }],
    ["`3 * x`", { type: "formula", formula: "3 * x" }],
    // NEW
    ["x[y]", { type: "binary", op: "[]", left: x, right: y }],
    ["x-y", { type: "binary", op: "-", left: x, right: y }],
    ["min x", { type: "unary", op: "min", operand: x }],
    ["max x", { type: "unary", op: "max", operand: x }],
    ["sum x", { type: "unary", op: "sum", operand: x }],
    ["Σx", { type: "unary", op: "sum", operand: x }],

    // compounds
    ["some not x", { type: "unary", op: "some", operand: { type: "unary", op: "not", operand: x } }],
    ["not some x", { type: "unary", op: "not", operand: { type: "unary", op: "some", operand: x } }],
    ["*x;y", { type: "binary", op: ";", left: { type: "unary", op: "*", operand: x }, right: y }],
    ["*x.y", { type: "binary", op: ".", left: { type: "unary", op: "*", operand: x }, right: y }],
    ["#x.y", { type: "unary", op: "#", operand: { type: "binary", op: ".", left: x, right: y } }],
    ["some x.y", { type: "unary", op: "some", operand: { type: "binary", op: ".", left: x, right: y } }],
    ["some x & y", { type: "binary", op: "&", left: { type: "unary", op: "some", operand: x }, right: y }],
    ["x[y.z]", { type: "binary", op: "[]", left: x, right: { type: "binary", op: ".", left: y, right: z } }],
    ["x[y;z]", { type: "binary", op: "[]", left: x, right: { type: "binary", op: ";", left: y, right: z } }],
    ["some x[y]", { type: "unary", op: "some", operand: { type: "binary", op: "[]", left: x, right: y } }],
    ["x.y[z]", { type: "binary", op: "[]", left: { type: "binary", op: ".", left: x, right: y }, right: z }],
    ["x[y][z]", { type: "binary", op: "[]", left: { type: "binary", op: "[]", left: x, right: y }, right: z }],
    ["x[y].z", { type: "binary", op: ".", left: { type: "binary", op: "[]", left: x, right: y }, right: z }],
    ["x-y-z", {type: "binary", op: "-", left: { type: "binary", op: "-", left: x, right: y }, right: z }],
    ["Σ x.y", { type: "unary", op: "sum", operand: { type: "binary", op: ".", left: x, right: y } }],
    ["#x > y", { type: "binary", op: ">", left: { type: "unary", op: "#", operand: x }, right: y }],
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
