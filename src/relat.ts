// relat is our funky higher-level relational language
// it's parsed (via relat-grammar.pegjs) into the AST defined here

import { assertNever } from "./misc.js";

export type Range = {
  source: string,
  start: number,
  end: number,
}

export function rangeString({source, start, end}: Range): string {
  return source.slice(start, end);
}

export type Expression<Meta = {range: Range}> = Meta & (
  | {
      type: 'constant',
      value: number | string,
    }
  | {
      type: 'identifier',
      name: string,
    }
  | {
      type: 'unary',
      op: 'some' | 'not' | '#' | '^' | '*' | '~', // 'some' | 'no' | 'lone' | 'one',
      operand: Expression<Meta>,
    }
  | {
      type: 'binary',
      op: '.' | '=' | '<' | '>' | '=<' | '>=' | ';' | '&' | ',' | '[]' | '-',
      left: Expression<Meta>,
      right: Expression<Meta>,
    }
  | {
      type: 'comprehension',
      variable: string,
      constraint: Expression<Meta>,
      body: Expression<Meta>,
    }
  | {
      type: 'let',
      variable: string,
      value: Expression<Meta>,
      body: Expression<Meta>,
    }
  | {
      type: 'formula',
      formula: string,
    }
)

// for testing
export function stripMeta<Meta>(expr: Expression<Meta>): Expression<{}> {
  switch (expr.type) {
    case 'constant':
      return { type: 'constant', value: expr.value };
    case 'identifier':
      return { type: 'identifier', name: expr.name };
    case 'unary':
      return { type: 'unary', op: expr.op, operand: stripMeta(expr.operand) };
    case 'binary':
      return { type: 'binary', op: expr.op, left: stripMeta(expr.left), right: stripMeta(expr.right) };
    case 'comprehension':
      return { type: 'comprehension', variable: expr.variable, constraint: stripMeta(expr.constraint), body: stripMeta(expr.body) };
    case 'let':
      return { type: 'let', variable: expr.variable, value: stripMeta(expr.value), body: stripMeta(expr.body) };
    case 'formula':
      return { type: 'formula', formula: expr.formula };
    default:
      assertNever(expr);
  }
}

export function toSexpr<Meta>(expr: Expression<Meta>): string {
  switch (expr.type) {
    case 'constant':
      return JSON.stringify(expr.value);
    case 'identifier':
      return expr.name;
    case 'unary':
      return `(${expr.op} ${toSexpr(expr.operand)})`;
    case 'binary':
      return `(${expr.op} ${toSexpr(expr.left)} ${toSexpr(expr.right)})`;
    case 'comprehension':
      return `(comprehension ${expr.variable} ${toSexpr(expr.constraint)} ${toSexpr(expr.body)})`;
    case 'let':
      return `(let ${expr.variable} ${toSexpr(expr.value)} ${toSexpr(expr.body)})`;
    case 'formula':
      return `(formula "${expr.formula}")`;
    default:
      assertNever(expr);
  }
}
