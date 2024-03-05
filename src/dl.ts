import objectInspect from 'object-inspect';
import { assertNever } from './misc.js';
import { type Type } from './souffle-types.js';


// dl is an AST format for Datalog targetting Souffle

export { type Type } from './souffle-types.js';

export type RelationName = string;
export type VariableName = string & { __VariableName: true };

export type TypedVariable = {
  name: VariableName,
  type: Type,
}

// For simplicity, dl only applies relations to variables. If you want to apply
// a relation to a literal, make up a dummy variable and bind the variable to
// the literal in a constraint.
export type Atom = {
  relName: RelationName,
  args: VariableName[],
}

export type Rule = {
  head: Atom,
  body: Literal[],
}

// A "literal" is a piece of a rule's body. (It is not a value like 123 or
// "abc"; those are "constants".)
export type Literal =
  | (
    & Atom
    & {
        negated?: boolean,
        // For simplicity, we only apply aggregates to a single relation at a
        // time. (This doesn't limit expressivity.)
        aggregate?: Aggregate,
      }
    )
  | string  // raw Souffle code; used for constraints

export type Aggregate =
  | { type: 'count', output: VariableName }
  | { type: 'min' | 'max' | 'sum', input: VariableName, output: VariableName }

export type Command =
  | { type: 'rule' } & Rule
  | {
      type: 'decl',
      relName: RelationName,
      sig: TypedVariable[],
      choiceDomains?: VariableName[][],
    }
  | {
      type: 'input',
      relName: RelationName,
    }
  | {
      type: 'output',
      relName: RelationName,
    }
  | {
      type: 'comment',
      comment: string,
    }
  | string
  | Command[]

export type Program = Command[]

export function programToString(program: Program): string {
  return program.map(commandToString).join('\n');
}

function commandToString(command: Command): string {
  if (typeof command === 'string') {
    return command;
  }
  if (Array.isArray(command)) {
    return command.map(commandToString).join('\n');
  }
  switch (command.type) {
    case 'rule':
      return `${atomToString(command.head)} :- ${command.body.map(literalToString).join(', ')}.`;
    case 'decl':
      const args = command.sig.map(({name, type}) => `${name} : ${type}`).join(', ');
      let commandStr = `.decl ${command.relName}(${args})`;
      if (command.choiceDomains) {
        commandStr += ` choice-domain ${command.choiceDomains.map(domain => `(${domain.join(', ')})`).join(', ')}`;
      }
      return commandStr;
    case 'input':
      return `.input ${command.relName}`;
    case 'output':
      return `.output ${command.relName}`;
    case 'comment':
      const lines = command.comment.split('\n');
      return lines.map(line => `// ${line}`).join('\n');
    default:
      const _exhaustiveCheck: never = command;
      void(_exhaustiveCheck);
      throw new Error(`Unexpected command: ${objectInspect(command)}`);
  }
}

function literalToString(lit: Literal): string {
  if (typeof lit === 'string') {
    return lit;
  }
  if (lit.aggregate) {
    if (lit.negated) {
      throw new Error(`Can't negate an aggregate literal`);
    }
    switch (lit.aggregate.type) {
      case 'count':
        return `${lit.aggregate.output} = count : { ${atomToString(lit)} }`;
      case 'min':
      case 'max':
      case 'sum':
        return `${lit.aggregate.output} = ${lit.aggregate.type} ${lit.aggregate.input} : { ${atomToString(lit)} }`;
      default:
        assertNever(lit.aggregate);
    }
  }
  return `${lit.negated ? '! ' : ''}${atomToString(lit)}`;
}

function atomToString(atom: Atom): string {
  return `${atom.relName}(${atom.args.join(', ')})`;
}
