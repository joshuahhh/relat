import * as Relat from './relat.js';
import { parse as peggyParse }  from './relat-grammar.js'

export function parse(input: string): Relat.Expression {
  const result = peggyParse(input, { grammarSource: input });
  // console.log("parsed", result)
  return result as any;
}
