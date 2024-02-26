import { Type } from './souffle-types.js';


// dl is an AST format for Datalog targetting Souffle

export { Type } from './souffle-types.js';

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
        // This is the one aggregate we support so far, "count". For simplicity,
        // we only apply it to a single relation at a time. (This doesn't limit
        // expressivity.)
        counting?: VariableName,
      }
    )
  | string  // raw Souffle code; used for constraints

export type Command =
  | { type: 'rule' } & Rule
  | {
      type: 'decl',
      relName: RelationName,
      sig: TypedVariable[],
    }
  | {
      type: 'input',
      relName: RelationName,
    }
  | {
      type: 'output',
      relName: RelationName,
    }
  | string

export type Program = Command[]

export function programToString(program: Program): string {
  return program.map(commandToString).join('\n');
}

function commandToString(command: Command): string {
  if (typeof command === 'string') {
    return command;
  }
  switch (command.type) {
    case 'rule':
      return `${atomToString(command.head)} :- ${command.body.map(literalToString).join(', ')}.`;
    case 'decl':
      const args = command.sig.map(({name, type}) => `${name} : ${type}`).join(', ');
      return `.decl ${command.relName}(${args})`;
    case 'input':
      return `.input ${command.relName}`;
    case 'output':
      return `.output ${command.relName}`;
    default:
      const _exhaustiveCheck: never = command;
      void(_exhaustiveCheck);
      throw new Error(`Unexpected command: ${command}`);
  }
}

function literalToString(lit: Literal): string {
  if (typeof lit === 'string') {
    return lit;
  }
  if (lit.counting) {
    if (lit.negated) {
      throw new Error(`Can't negate a counting literal`);
    }
    return `${lit.counting} = count : { ${atomToString(lit)} }`;
  }
  return `${lit.negated ? '! ' : ''}${atomToString(lit)}`;
}

function atomToString(atom: Atom): string {
  return `${atom.relName}(${atom.args.join(', ')})`;
}

/*
.decl isPerson(x : number)
.decl hasChild(x : number, y : number)
.decl isHappy(x : number)

isPerson(10).
isPerson(11).
isPerson(12).
isPerson(13).
isPerson(20).
isPerson(21).
isPerson(22).
isPerson(23).
isPerson(30).

hasChild(10,11).
hasChild(10,12).
hasChild(10,13).
hasChild(20,21).
hasChild(20,22).
hasChild(20,23).
isHappy(11).
isHappy(12).
isHappy(13).
isHappy(21).
isHappy(22).

.decl hasSadChild(x : number)
hasSadChild(x) :- hasChild(x, y), !isHappy(y).

.decl hasOnlyHappyChildren(x : number)
hasOnlyHappyChildren(x) :- ! hasSadChild(x), isPerson(x).

.output hasOnlyHappyChildren
*/

