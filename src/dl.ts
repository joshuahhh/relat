export type RelationName = string;
export type VariableName = string;

export type Type = 'symbol' | 'number';

export type TypedVariable = {
  name: VariableName,
  type: Type,
}

export type Atom = {
  relName: RelationName,
  args: VariableName[],
}

export type Rule = {
  head: Atom,
  body: Term[],
}

export type Term =
  | (
    & Atom
    & {
        negated?: boolean,
        counting?: VariableName,
      }
    )
  | string

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
      return `${atomToString(command.head)} :- ${command.body.map(termToString).join(', ')}.`;
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

function termToString(term: Term): string {
  if (typeof term === 'string') {
    return term;
  }
  if (term.counting) {
    if (term.negated) {
      throw new Error(`Can't negate a counting term`);
    }
    return `${term.counting} = count : { ${atomToString(term)} }`;
  }
  return `${term.negated ? '! ' : ''}${atomToString(term)}`;
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

