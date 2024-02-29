import { parse } from './relat-grammar/relat-grammar.js';
import * as Relat from './relat.js';

export function parseRelat(input: string): Relat.Expression {
  return parse(input, {
    grammarSource: input,
    // error: () => { console.log("error", arguments)}
  }) as any;
}
