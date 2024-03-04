import _ from 'lodash';
import inspect from 'object-inspect';
import * as DL from './dl.js';
import { entries, fromEntries } from './misc.js';
import * as Relat from './relat.js';


export function mkNextIndex() {
  let i = 0;
  return () => { return ++i; }
}

// a little insight: there's an important distinction between RELAT VARIABLES
// (like the x in {x : set | exp}) and DATALOG VARIABLES. among other things, in
// this translation process we must make sure to remember the exact names of
// RELAT VARIABLES (since they're determined by the input code), but DATALOG
// VARIABLES need only be consistent within rules!

// We do use Relat variables directly as Datalog variables, for convenience
// sake.

export type RelatVariable = DL.VariableName & { __RelatVariable: true };

export type RelatVariableBinding =
  | { type: 'scalar', scalarType: DL.Type, constraint: DL.Atom, constraintExtSlots: RelatVariable[] }
      // These come from comprehensions; will become part of extSlots.
      // `constraint` gives an atom that will constrain use of this variable in
      // the body of the comprehension. This is important to make sure that all
      // variables are grounded. `constraintExtSlots` are external variables
      // referred to in the constraint; they come along for the ride as extra
      // references when you refer to this variable.
  | { type: 'relation', intExt: IntExt }
      // these come from input relations and `let` bindings

export type Environment = {
  // When you translate a Relat expression, you do so in the context of an
  // Environment.
  nextIndex: () => number,
    // Generator for unique indices.
  scope: Scope,
}

type Scope = Record<RelatVariable, RelatVariableBinding>;

function getFromScope(varName: RelatVariable, scope: Scope): RelatVariableBinding | undefined {
  return scope[varName];
}
function getScalarTypeFromScope(varName: RelatVariable, scope: Scope): DL.Type {
  const type = getFromScope(varName, scope);
  if (!type || type.type !== 'scalar') {
    throw new Error(`Variable ${varName} not in scope as scalar`);
  }
  return type.scalarType;
}
function getAllExtSlots(scope: Scope): RelatVariable[] {
  return entries(scope)
    .filter(([_, binding]) => binding.type === 'scalar')
    .map(([name, _]) => name);
}
function mergeExtSlots(slots1: RelatVariable[], slots2: RelatVariable[]): RelatVariable[] {
  return _.uniq([...slots1, ...slots2]);
}
function constraintForExtSlots(extSlots: RelatVariable[], scope: Scope): DL.Literal[] {
  return extSlots.flatMap((name) => {
    const binding = scope[name];
    if (!binding) {
      throw new Error(`Variable ${name} not in scope`);
    }
    if (binding.type !== 'scalar') {
      throw new Error(`Variable ${name} not in scope as scalar`);
    }
    return binding.constraint;
  });
}

export type IntExt = {
  // IntExt describes a relation with internal arguments (those which are
  // actually semantically arguments of the relation) and external arguments
  // (which reflect dependencies on variables in scope).
  relName: DL.RelationName,
  intSlots: IntSlot[],
    // `debugName` is purely a hint for producing more legible output.
  extSlots: RelatVariable[],
    // These variable names are significant, as they bind the IntExt to in-scope
    // Relat variables. Types are not included, as they should be available from
    // the context. Also: these names should all be distinct (per shadowing
    // rules.)
}

type IntSlot = { type: DL.Type, debugName: string };

function slotTypesMatch(slots1: IntSlot[], slots2: IntSlot[]): boolean {
  if (slots1.length !== slots2.length) {
    return false;
  }
  for (let i = 0; i < slots1.length; i++) {
    if (slots1[i].type !== slots2[i].type) {
      return false;
    }
  }
  return true;
}
function slotTypesPrefix(slots1: IntSlot[], slots2: IntSlot[]): boolean {
  return slotTypesMatch(slots1, slots2.slice(0, slots1.length));
}
function slotTypesSuffix(slots1: IntSlot[], slots2: IntSlot[]): boolean {
  return slotTypesMatch(slots1, slots2.slice(slots2.length - slots1.length));
}

// utility: common desire is to generate unique DL vars to go with an IntExt's
// intSlots. here u go
type NamedIntSlot = IntSlot & { name: DL.VariableName };
function nameSlots(intSlots: IntSlot[], nextIndex: () => number): NamedIntSlot[] {
  return intSlots.map((intSig) => nameSlot(intSig, nextIndex));
}
function nameSlot(intSlot: IntSlot, nextIndex: () => number): NamedIntSlot {
  return { ...intSlot, name: mkDLVarUnsafe(`i_${nextIndex()}_${intSlot.debugName}`) };
}

// Translating an expression (in an environment) results in both:
// * an IntExt, which is a relation with internal & external arguments
// * a program which ensures that the relation reflects the desired expression
export type TranslationResult = IntExt & { program: DL.Program }


function mkDLVarUnsafe(name: string) {
  return name as DL.VariableName;
}

function mkDLVar(debugName: string, nextIndex: () => number): DL.VariableName {
  return mkDLVarUnsafe(`v_${nextIndex()}_${debugName}`);
}

const unnamedDLVar: DL.VariableName = mkDLVarUnsafe('_');

export function mkRelatVarUnsafe(name: string) {
  return name as RelatVariable;
}

function comment(s: string): DL.Command {
  return { type: 'comment', comment: s };
}

// Produce a decl for a fresh IntExt
function decl({relName, intSlots, extSlots}: IntExt, scope: Scope, choiceDomain?: DL.VariableName[][]): DL.Command {
  return {
    type: 'decl',
    relName,
    sig: [
      ...intSlots.map(({ type, debugName }, i) => ({name: mkDLVarUnsafe(`i_${i}_${debugName}`), type})),
      ...extSlots.map((name) => ({name: mkDLVarUnsafe(`e_${name}`), type: getScalarTypeFromScope(name, scope)})),
    ],
    choiceDomains: choiceDomain,
  };
}

type DLVarish = DL.VariableName | { name: DL.VariableName };
function unDLVarish(v: DLVarish): DL.VariableName {
  return typeof v === 'string' ? v : v.name;
}
function atom(intExt: IntExt, intArgs: DLVarish[]): DL.Atom {
  const {relName, intSlots, extSlots} = intExt;
  if (intArgs.length !== intSlots.length) {
    throw new Error(`Internal error: provided ${intArgs.length} args to relation with ${intSlots.length} intSlots`);
  }
  return {
    relName,
    args: [...intArgs.map(unDLVarish), ...extSlots]
  };
}

export class TranslationError extends Error {
  constructor(public exp: Relat.Expression, public env: Environment, public cause: unknown) {
    const message = cause instanceof Error ? cause.message : inspect(cause);
    super(`Error translating ${Relat.rangeString(exp.range)}: ${message}`, { cause });
    if (cause instanceof Error) { this.stack = cause.stack; }
  }
}

export function translate(exp: Relat.Expression, env: Environment): TranslationResult {
  const nextIndex = mkNextIndex();

  try {
    // console.log('translate', Relat.rangeString(exp.range), env);

    if (exp.type === 'identifier') {
      /**************
       * IDENTIFIER *
       **************/
      const relatVar = mkRelatVarUnsafe(exp.name);
      const relatVarBinding = getFromScope(relatVar, env.scope);
      if (!relatVarBinding) {
        throw new Error(`Unknown identifier: ${exp.name}`);
      } else if (relatVarBinding.type === 'scalar') {
        const intExt: IntExt = {
          relName: `R${env.nextIndex()}`,
          intSlots: [ { type: relatVarBinding.scalarType, debugName: exp.name } ],
          extSlots: [ relatVar, ...relatVarBinding.constraintExtSlots ],
        }
        return {
          ...intExt,
          program: [
            '',
            comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (identifier)`),
            decl(intExt, env.scope),
            {
              type: 'rule',
              head: atom(intExt, [ relatVar ]),
                // so the provided int var will overlap with an ext var
              body: [ relatVarBinding.constraint ],
            }
          ],
        };
      } else if (relatVarBinding.type === 'relation') {
        return {
          ...relatVarBinding.intExt,
          program: [],
        }
      } else {
        throw new Error(`Unknown identifier: ${exp.name}`);
      }
    } else if (exp.type === 'binary' && exp.op === '.') {
      // TODO: extremely hacked in support for x._ & _.x
      if (exp.left.type === 'identifier' && exp.left.name === '_') {
        return translate(Relat.addMeta(Relat.o('[_]', exp.right), { range: exp.range }), env);
      }
      if (exp.right.type === 'identifier' && exp.right.name === '_') {
        const operandResult = translate(exp.left, env);
        if (operandResult.intSlots.length === 0) {
          throw new Error(`Cannot apply wildcard to relation with arity 0`);
        }
        const operandNamedSlots = nameSlots(operandResult.intSlots, nextIndex);
        const intExt: IntExt = {
          relName: `R${env.nextIndex()}`,
          intSlots: operandNamedSlots.slice(0, -1),
          extSlots: operandResult.extSlots,
        };
        return {
          ...intExt,
          program: [
            ...operandResult.program,
            '',
            comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (wildcard application)`),
            decl(intExt, env.scope),
            {
              type: 'rule',
              head: atom(intExt, operandNamedSlots.slice(0, -1)),
              body: [
                atom(operandResult, [ ...operandNamedSlots.slice(0, -1), unnamedDLVar ]),
                ...constraintForExtSlots(intExt.extSlots, env.scope),
              ],
            },
          ],
        };
      }

      /************
       * DOT-JOIN *
       ************/
      // result(A..., C...) :- left(A..., B), right(B, C...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (leftResult.intSlots.length === 0) {
        throw new Error(`Left-hand side of dot-join must have arity > 0`);
      }
      if (rightResult.intSlots.length === 0) {
        throw new Error(`Right-hand side of dot-join must have arity > 0`);
      }
      if (_.last(leftResult.intSlots)!.type !== _.first(rightResult.intSlots)!.type) {
        throw new Error(`Last argument of left-hand side of dot-join must have same type as first argument of right-hand side`);
      }
      const leftNamedSlots = nameSlots(leftResult.intSlots, nextIndex);
      const rightNamedSlots = nameSlots(rightResult.intSlots, nextIndex);
      const joinNamedSlots = [..._.dropRight(leftNamedSlots, 1), ..._.drop(rightNamedSlots, 1)];
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: joinNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (dot-join)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, joinNamedSlots),
            body: [
              atom(leftResult, leftNamedSlots),
              atom(rightResult, [_.last(leftNamedSlots)!, ..._.tail(rightNamedSlots)]),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === ',') {
      /*********************
       * CARTESIAN PRODUCT *
       *********************/
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      const leftNamedSlots = nameSlots(leftResult.intSlots, nextIndex);
      const rightNamedSlots = nameSlots(rightResult.intSlots, nextIndex);
      const joinNamedSlots = [...leftNamedSlots, ...rightNamedSlots];
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: joinNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (cartesian product)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, joinNamedSlots),
            body: [
              atom(leftResult, leftNamedSlots),
              atom(rightResult, rightNamedSlots),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'comprehension') {
      /*****************
       * COMPREHENSION *
       *****************/
      const newRelatVars = exp.variables.map(mkRelatVarUnsafe);
      for (const newRelatVar of newRelatVars) {
        if (getFromScope(newRelatVar, env.scope)) {
          throw new Error(`Variable ${newRelatVar} already in scope`);
        }
      }
      const constraintResult = translate(exp.constraint, env);
      if (constraintResult.intSlots.length !== newRelatVars.length) {
        throw new Error(`Comprehension has ${newRelatVars.length} variables but constraint has ${constraintResult.intSlots.length} arguments`);
      }
      const newIntSlots: IntSlot[] = newRelatVars.map((newRelatVar, i) => ({
        debugName: newRelatVar,
        type: constraintResult.intSlots[i].type,
      }));
      const envForBody: Environment = {
        ...env,
        scope: {
          ...env.scope,
          ...fromEntries(newRelatVars.map((newRelatVar, i) => [
            newRelatVar,
            {
              type: 'scalar',
              scalarType: newIntSlots[i].type,
              constraint: atom(constraintResult, constraintResult.intSlots.map((_, j) => j === i ? newRelatVar : unnamedDLVar)),
              constraintExtSlots: constraintResult.extSlots,
            },
          ] satisfies [RelatVariable, RelatVariableBinding])),  // TODO: why do I need this type check? scary
        },
      };
      const bodyResult = translate(exp.body, envForBody);
      const bodyNamedSlots = nameSlots(bodyResult.intSlots, nextIndex);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ ...newIntSlots, ...bodyNamedSlots ],
        extSlots: _.difference(bodyResult.extSlots, newRelatVars),
      };
      return {
        ...intExt,
        program: [
          ...constraintResult.program,
          ...bodyResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (comprehension)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ ...newRelatVars, ...bodyNamedSlots ]),
            body: [
              atom(constraintResult, newRelatVars),
              atom(bodyResult, bodyNamedSlots),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'unary' && exp.op === 'some') {
      /********
       * SOME *
       ********/
      const operandResult = translate(exp.operand, env);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [],
        extSlots: operandResult.extSlots,
      };

      const operandNamedSlots = nameSlots(operandResult.intSlots, nextIndex);
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (some)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, []),
            body: [
              atom(operandResult, operandNamedSlots.map(() => unnamedDLVar)),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ]
          },
        ],
      };
    } else if (exp.type === 'unary' && exp.op === 'not') {
      /*******
       * NOT *
       *******/
      const operandResult = translate(exp.operand, env);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [],
        extSlots: operandResult.extSlots,
      };
      const operandNamedSlots = nameSlots(operandResult.intSlots, nextIndex);
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (not)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, operandNamedSlots),
            body: [
              {
                ...atom(operandResult, operandNamedSlots.map(() => unnamedDLVar)),
                negated: true,
              },
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'unary' && (exp.op === '^' || exp.op === '*')) {
      /******************************
       * TRANSITIVE CLOSURE (^ / *) *
       ******************************/
      if (exp.op === '*') {
        // TODO: I don't actually know how to handle this; what's the universe?
        throw new Error(`Reflexive transitive closure (*) not yet implemented`);
      }
      const operandResult = translate(exp.operand, env);
      if (operandResult.intSlots.length !== 2) {
        throw new Error(`Transitive closure must have arity 2`);
      }
      if (operandResult.intSlots[0].type !== operandResult.intSlots[1].type) {
        throw new Error(`Transitive closure must have same type for both arguments`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: operandResult.intSlots,
        extSlots: operandResult.extSlots,
      };
      const operandNamedSlots = nameSlots(operandResult.intSlots, nextIndex);
      const middleVar = mkDLVar('middle', nextIndex);
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (transitive closure)`),
          decl(intExt, env.scope),
          // 1. new relation includes old relation
          {
            type: 'rule',
            head: atom(intExt, operandNamedSlots),
            body: [
              atom(operandResult, operandNamedSlots),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
          // 2. new relation includes transitive closure of old relation
          {
            type: 'rule',
            head: atom(intExt, operandNamedSlots),
            body: [
              atom(intExt, [ operandNamedSlots[0], middleVar ]),
              atom(operandResult, [ middleVar, operandNamedSlots[1] ]),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'unary' && exp.op === '~') {
      /*************
       * TRANSPOSE *
       *************/
      // result(B, A) :- operand(A, B)
      const operandResult = translate(exp.operand, env);
      if (operandResult.intSlots.length !== 2) {
        throw new Error(`Transpose must have arity 2`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ operandResult.intSlots[1], operandResult.intSlots[0] ],
        extSlots: operandResult.extSlots,
      };
      const operandNamedSlots = nameSlots(operandResult.intSlots, nextIndex);
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (transpose)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ operandNamedSlots[1], operandNamedSlots[0] ]),
            body: [
              atom(operandResult, operandNamedSlots),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === ';') {
      /*********
       * UNION *
       *********/
      // result(A...) :- left(A...)
      // result(A...) :- right(A...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!slotTypesMatch(leftResult.intSlots, rightResult.intSlots)) {
        throw new Error(`Relations in union must have matching signatures, but got ${inspect(leftResult.intSlots)} and ${inspect(rightResult.intSlots)}`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: leftResult.intSlots,  // TODO: debugName from left? meh why not
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const namedSlots = nameSlots(intExt.intSlots, nextIndex);
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (union)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, namedSlots),
            body: [
              atom(leftResult, namedSlots),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
          {
            type: 'rule',
            head: atom(intExt, namedSlots),
            body: [
              atom(rightResult, namedSlots),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === '&') {
      /****************
       * INTERSECTION *
       ****************/
      // result(A...) :- left(A...), right(A...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!slotTypesMatch(leftResult.intSlots, rightResult.intSlots)) {
        throw new Error(`Relations in intersection must have matching signatures, but got ${inspect(leftResult.intSlots)} and ${inspect(rightResult.intSlots)}`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: leftResult.intSlots,  // TODO: debugName from left? meh why not
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const namedSlots = nameSlots(intExt.intSlots, nextIndex);
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (intersection)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, namedSlots),
            body: [
              atom(leftResult, namedSlots),
              atom(rightResult, namedSlots),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === '-') {
      /**************
       * DIFFERENCE *
       **************/
      // result(A...) :- left(A...), !right(A...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!slotTypesMatch(leftResult.intSlots, rightResult.intSlots)) {
        throw new Error(`Relations in difference must have matching signatures, but got ${inspect(leftResult.intSlots)} and ${inspect(rightResult.intSlots)}`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: leftResult.intSlots,  // TODO: debugName from left? meh why not
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const namedSlots = nameSlots(intExt.intSlots, nextIndex);
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (intersection)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, namedSlots),
            body: [
              atom(leftResult, namedSlots),
              {
                ...atom(rightResult, namedSlots),
                negated: true,
              },
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === '[]') {
      /***************
       * APPLICATION *
       ***************/
      // result(B...) :- left(A..., B...), right(A...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!slotTypesPrefix(rightResult.intSlots, leftResult.intSlots)) {
        throw new Error(`Cannot apply relation with signature ${inspect(leftResult.intSlots)} to relation with signature ${inspect(rightResult.intSlots)}`);
      }
      const leftNamedSlots = nameSlots(leftResult.intSlots, nextIndex);
      const resultNamedSlots = leftNamedSlots.slice(rightResult.intSlots.length);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: resultNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (application)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, resultNamedSlots),
            body: [
              atom(leftResult, leftNamedSlots),
              atom(rightResult, leftNamedSlots.slice(0, rightResult.intSlots.length)),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'unary' && exp.op === '[_]') {
      /************************
       * WILDCARD APPLICATION * (hacky stopgap)
       ************************/
      const operandResult = translate(exp.operand, env);
      if (operandResult.intSlots.length === 0) {
        throw new Error(`Cannot apply wildcard to relation with arity 0`);
      }
      const operandNamedSlots = nameSlots(operandResult.intSlots, nextIndex);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: operandNamedSlots.slice(1),
        extSlots: operandResult.extSlots,
      };
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (wildcard application)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, operandNamedSlots.slice(1)),
            body: [
              atom(operandResult, [ unnamedDLVar, ...operandNamedSlots.slice(1) ]),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === '<:') {
      /***************
       * PREFIX JOIN *
       ***************/
      // result(A..., B...) :- left(A...), right(A..., B...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!slotTypesPrefix(leftResult.intSlots, rightResult.intSlots)) {
        throw new Error(`Cannot join relation with signature ${inspect(leftResult.intSlots)} as prefix of relation with signature ${inspect(rightResult.intSlots)}`);
      }
      const rightNamedSlots = nameSlots(rightResult.intSlots, nextIndex);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: rightNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (prefix join)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, rightNamedSlots),
            body: [
              atom(leftResult, rightNamedSlots.slice(0, leftResult.intSlots.length)),
              atom(rightResult, rightNamedSlots),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === ':>') {
      /***************
       * SUFFIX JOIN *
       ***************/
      // result(A..., B...) :- left(A..., B...), right(B...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!slotTypesSuffix(rightResult.intSlots, leftResult.intSlots)) {
        throw new Error(`Cannot join relation with signature ${inspect(rightResult.intSlots)} as suffix of relation with signature ${inspect(leftResult.intSlots)}`);
      }
      const leftNamedSlots = nameSlots(leftResult.intSlots, nextIndex);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: leftNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (suffix join)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, leftNamedSlots),
            body: [
              atom(leftResult, leftNamedSlots),
              atom(rightResult, leftNamedSlots.slice(leftResult.intSlots.length - rightResult.intSlots.length)),
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else if (exp.type === 'let') {
      /*******
       * LET *
       *******/
      const newRelatVar: RelatVariable = mkRelatVarUnsafe(exp.variable);
      const relatVarBinding = getFromScope(newRelatVar, env.scope);
      if (relatVarBinding) {
        throw new Error(`Variable ${exp.variable} already in scope`);
      }
      const valueResult = translate(exp.value, env);
      const envForBody: Environment = {
        ...env,
        scope: {
          ...env.scope,
          [exp.variable]: { type: 'relation', name: newRelatVar, intExt: valueResult },
        },
      };
      const bodyResult = translate(exp.body, envForBody);
      return {
        ...bodyResult,
        program: [
          ...valueResult.program,
          ...bodyResult.program,
        ],
      };
    } else if (exp.type === 'unary' && exp.op === '#') {
      /*********
       * COUNT *
       *********/
      const operandResult = translate(exp.operand, env);
      const countNamedSlot: NamedIntSlot = {
        name: mkDLVar('count', nextIndex),
        type: 'number',
        debugName: 'count',
      };
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ countNamedSlot ],
        extSlots: operandResult.extSlots,
      };
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (count)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ countNamedSlot ]),
            body: [
              {
                ...atom(operandResult, operandResult.intSlots.map(() => unnamedDLVar)),
                aggregate: { type: 'count', output: countNamedSlot.name },
              },
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ]
          },
        ],
      };
    } else if (exp.type === 'unary' && (exp.op === 'min' || exp.op === 'max' || exp.op === 'sum')) {
      /***************
       * MIN/MAX/SUM *
       ***************/
      const operandResult = translate(exp.operand, env);
      if (operandResult.intSlots.length === 0) {
        throw new Error(`Cannot ${exp.op} relation with arity 0`);
      }
      const inputNamedSlot: NamedIntSlot = nameSlot(operandResult.intSlots[operandResult.intSlots.length - 1], nextIndex)
      if (inputNamedSlot.type !== 'number') {
        throw new Error(`Cannot ${exp.op} relation with non-number last argument`);
      }
      const outputNamedSlot: NamedIntSlot = {
        name: mkDLVar(exp.op, nextIndex),
        type: 'number',
        debugName: exp.op,
      };
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ outputNamedSlot ],
        extSlots: operandResult.extSlots,
      };
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (count)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ outputNamedSlot ]),
            body: [
              {
                ...atom(operandResult, operandResult.intSlots.map((_, i) =>
                  i < operandResult.intSlots.length - 1 ? unnamedDLVar : inputNamedSlot
                )),
                aggregate: { type: exp.op, input: inputNamedSlot.name, output: outputNamedSlot.name },
              },
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ]
          },
        ],
      };
    } else if (exp.type === 'binary' && (exp.op === '=' || exp.op === '<' || exp.op === '>' || exp.op === '<=' || exp.op === '>=')) {
      /***************
       * COMPARISONS *
       ***************/
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (leftResult.intSlots.length !== 1) {
        throw new Error(`Left-hand side of comparison must have arity 1`);
      }
      if (rightResult.intSlots.length !== 1) {
        throw new Error(`Right-hand side of comparison must have arity 1`);
      }
      if (leftResult.intSlots[0].type !== rightResult.intSlots[0].type) {
        throw new Error(`Comparison must have matching types on both sides`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ ],
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const leftVar = mkDLVar('left', nextIndex);
      const rightVar = mkDLVar('right', nextIndex);
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (comparison)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ ]),
            body: [
              atom(leftResult, [ leftVar ]),
              atom(rightResult, [ rightVar ]),
               `(${leftVar} ${exp.op} ${rightVar})`,
               ...constraintForExtSlots(intExt.extSlots, env.scope),
            ]
          },
        ],
      };
    } else if (exp.type === 'constant') {
      /************
       * CONSTANT *
       ************/
      const namedSlot = nameSlot({
        debugName: 'constant', type: typeof exp.value === 'string' ? 'symbol' : 'number' },
        nextIndex
      );
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ namedSlot ],
        extSlots: [ ],
      };
      return {
        ...intExt,
        program: [
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (literal)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ namedSlot ]),
            body: [
              `(${namedSlot.name} = ${typeof exp.value === 'string' ? `"${exp.value}"` : exp.value})`,
            ],
          },
        ],
      };
    } if (exp.type === 'formula') {
      /***********
       * FORMULA *
       ***********/
      // TODO: guess we're assuming it's a number? hmmmmm
      const namedSlot = nameSlot({debugName: 'formula', type: 'number' }, nextIndex);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ namedSlot ],
        extSlots: getAllExtSlots(env.scope),  // TODO: guess we should parse & constrain this?
      };
      return {
        ...intExt,
        program: [
          '',
          comment(`${intExt.relName}: ${Relat.rangeString(exp.range)} (formula)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ namedSlot ]),
            body: [
              `(${namedSlot.name} = ${exp.formula})`,
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } if (exp.type === 'unary' && exp.op === 'index') {
      // .decl result(A, N) choice-domain A, N
      // result(A, 0) :- operand(A)
      // result(A, N + 1) :- result(_, N), operand(A)
      const operandResult = translate(exp.operand, env);
      const operandNamedSlots = nameSlots(operandResult.intSlots, nextIndex);
      const nNamedSlot = nameSlot({debugName: 'index', type: 'number' }, nextIndex);
      const nPlus1NamedSlot = nameSlot({debugName: 'indexPlus1', type: 'number' }, nextIndex);
      const resultIntExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ ...operandNamedSlots, nNamedSlot ],
        extSlots: operandResult.extSlots,
      };
      const sigExtSlots = resultIntExt.extSlots.map((name) => ({name: mkDLVarUnsafe(`e_${name}`), type: getScalarTypeFromScope(name, env.scope)}));
      return {
        ...resultIntExt,
        program: [
          ...operandResult.program,
          '',
          comment(`${resultIntExt.relName}: ${Relat.rangeString(exp.range)} (index)`),
          {
            type: 'decl',
            relName: resultIntExt.relName,
            sig: [
              ...operandNamedSlots,
              nNamedSlot,
              ...sigExtSlots,
            ],
            choiceDomains: [
              [...operandNamedSlots.map(({name}) => name), ...sigExtSlots.map(({name}) => name)],
              [nNamedSlot.name, ...sigExtSlots.map(({name}) => name)],
            ],
          },
          {
            type: 'rule',
            head: atom(resultIntExt, [ ...operandNamedSlots, nNamedSlot ]),
            body: [
              atom(operandResult, operandNamedSlots),
              `${nNamedSlot.name} = 0`,
              ...constraintForExtSlots(resultIntExt.extSlots, env.scope),
            ],
          },
          {
            type: 'rule',
            head: atom(resultIntExt, [ ...operandNamedSlots, nPlus1NamedSlot ]),
            body: [
              atom(resultIntExt, [ ...operandNamedSlots.map(() => unnamedDLVar), nNamedSlot ]),
              atom(operandResult, operandNamedSlots),
              `${nPlus1NamedSlot.name} = ${nNamedSlot.name} + 1`,
              ...constraintForExtSlots(resultIntExt.extSlots, env.scope),
            ],
          },
        ],
      };
    } else {
      // assertNever(exp);
      throw new Error(`Unexpected expression (${JSON.stringify(exp)})`);
    }
  } catch (e) {
    if (e instanceof TranslationError) {
      // error is from subexpression; rethrow
      throw e;
    } else {
      throw new TranslationError(exp, env, e);
    }
  }
}

export function translationResultToFullProgram(
  result: TranslationResult,
  scope: Record<RelatVariable, RelatVariableBinding & {type: 'relation'}>
): DL.Program {
  return [
    ...entries(scope).flatMap(([relName, { intExt }]) => [
      decl(intExt, {}),
      { type: 'input', relName } satisfies DL.Command,
    ]),
    '',
    ...result.program,
    '',
    {
      type: 'output',
      relName: result.relName,
    }
  ];
}
