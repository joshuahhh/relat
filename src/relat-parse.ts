import * as Relat from './relat.js';
import { parse, SyntaxError } from './relat-grammar/relat-grammar.js'

export function parseRelat(input: string): Relat.Expression {
  try {
    return parse(input, { grammarSource: input }) as any;
  } catch (e) {
    if (e instanceof SyntaxError) {
      // TODO: ugly AI stuff but it works!
      const loc = e.location;
      const highlightedSource =
        loc.source.slice(0, loc.start.offset) +
        "\x1b[1m" + loc.source.slice(loc.start.offset, loc.end.offset) + "\x1b[22m" +
        loc.source.slice(loc.end.offset);
      e.message =
        e.message +
        "\n    " + highlightedSource +
        "\n    " + " ".repeat(loc.start.column - 1) + "\x1b[1m^\x1b[22m";
      throw e;
    } else {
      throw e;
    }
  }
}
