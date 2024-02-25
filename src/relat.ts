// relat is our funky higher-level relational language
// it's parsed (via relat-grammar.pegjs) into the AST defined here

export type Range = {
  source: string,
  start: number,
  end: number,
}

export function rangeString({source, start, end}: Range): string {
  return source.slice(start, end);
}

export type Expression = {range: Range} & (
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
      operand: Expression,
    }
  | {
      type: 'binary',
      op: '.' | '=' | '<' | '>' | '=<' | '>=' | '+' | '&',
      left: Expression,
      right: Expression,
    }
  | {
      type: 'comprehension',
      variable: string,
      constraint: Expression,
      body: Expression,
    }
  | {
      type: 'let',
      variable: string,
      value: Expression,
      body: Expression,
    }
)
