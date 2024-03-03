import _ from 'lodash';
import inspect from 'object-inspect';
import * as DL from './dl.js';
import { entries } from './misc.js';
import * as Relat from './relat.js';
import { rangeString } from './relat.js';


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

// utility: common desire is to generate unique DL vars to go with an IntExt's
// intSlots. here u go
type NamedIntSlot = IntSlot & { dlVar: DL.VariableName };
function nameSlots(intSlots: IntSlot[], nextIndex: () => number): NamedIntSlot[] {
  return intSlots.map((intSig) => nameSlot(intSig, nextIndex));
}
function nameSlot(intSlot: IntSlot, nextIndex: () => number): NamedIntSlot {
  return { ...intSlot, dlVar: mkDLVarUnsafe(`i_${nextIndex()}_${intSlot.debugName}`) };
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
function decl({relName, intSlots, extSlots}: IntExt, scope: Scope): DL.Command {
  return {
    type: 'decl',
    relName,
    sig: [
      ...intSlots.map(({ type, debugName }, i) => ({name: mkDLVarUnsafe(`i_${i}_${debugName}`), type})),
      ...extSlots.map((name) => ({name: mkDLVarUnsafe(`e_${name}`), type: getScalarTypeFromScope(name, scope)})),
    ],
  };
}

type DLVarish = DL.VariableName | { dlVar: DL.VariableName };
function unDLVarish(v: DLVarish): DL.VariableName {
  return typeof v === 'string' ? v : v.dlVar;
}
function atom(intExt: IntExt, intArgs: DLVarish[]): DL.Atom {
  const {relName, intSlots, extSlots} = intExt;
  if (intArgs.length !== intSlots.length) {
    throw new Error(`Arity mismatch: provided ${intArgs.length} args to relation with ${intSlots.length} intSlots`);
  }
  return {
    relName,
    args: [...intArgs.map(unDLVarish), ...extSlots]
  };
}

export class TranslationError extends Error {
  constructor(public exp: Relat.Expression, public env: Environment, public cause: Error) {
    super(`Error translating ${rangeString(exp.range)}: ${cause.message}`);
  }
}

export function translate(exp: Relat.Expression, env: Environment): TranslationResult {
  const nextIndex = mkNextIndex();

  try {
    // console.log('translate', rangeString(exp.range), env);

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
            comment(`${intExt.relName}: ${rangeString(exp.range)} (identifier)`),
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
      /************
       * DOT-JOIN *
       ************/
      // result(A..., C...) = left(A..., B), right(B, C...)
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (dot-join)`),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (cartesian product)`),
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
      const newRelatVar = mkRelatVarUnsafe(exp.variable);
      const relatVarBinding = getFromScope(newRelatVar, env.scope);
      if (relatVarBinding) {
        throw new Error(`Variable ${exp.variable} already in scope`);
      }
      const constraintResult = translate(exp.constraint, env);
      if (constraintResult.intSlots.length !== 1) {
        throw new Error(`Constraint of comprehension must have arity 1`);
      }
      const newIntSlot: IntSlot = {
        debugName: exp.variable,
        type: constraintResult.intSlots[0].type
      };
      const envForBody: Environment = {
        ...env,
        scope: {
          ...env.scope,
          [newRelatVar]: {
            type: 'scalar',
            scalarType: newIntSlot.type,
            constraint: atom(constraintResult, [newRelatVar]),
            constraintExtSlots: constraintResult.extSlots,
          } satisfies RelatVariableBinding,  // TODO: why do I need this? this is scary
        },
      };
      const bodyResult = translate(exp.body, envForBody);
      const bodyNamedSlots = nameSlots(bodyResult.intSlots, nextIndex);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ newIntSlot, ...bodyNamedSlots ],
        extSlots: _.difference(bodyResult.extSlots, [newRelatVar]),
      };
      return {
        ...intExt,
        program: [
          ...constraintResult.program,
          ...bodyResult.program,
          '',
          comment(`${intExt.relName}: ${rangeString(exp.range)} (comprehension)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ newRelatVar, ...bodyNamedSlots ]),
            body: [
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (some)`),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (not)`),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (transitive closure)`),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (transpose)`),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (union)`),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (intersection)`),
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
      // result(A...) = left(A...), !right(A...)
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (intersection)`),
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
      // result(B...) = left(A..., B...), right(A...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (leftResult.intSlots.length < rightResult.intSlots.length) {
        throw new Error(`Cannot apply relation with ${rightResult.intSlots.length} arguments to relation with ${leftResult.intSlots.length} arguments`);
      }
      if (!slotTypesMatch(leftResult.intSlots.slice(0, rightResult.intSlots.length), rightResult.intSlots)) {
        throw new Error(`Cannot apply relation with signature ${inspect(rightResult.intSlots)} to relation with signature ${inspect(leftResult.intSlots)}`);
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (application)`),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (wildcard application)`),
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
        dlVar: mkDLVar('count', nextIndex),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (count)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ countNamedSlot ]),
            body: [
              {
                ...atom(operandResult, operandResult.intSlots.map(() => unnamedDLVar)),
                aggregate: { type: 'count', output: countNamedSlot.dlVar },
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
        dlVar: mkDLVar(exp.op, nextIndex),
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (count)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ outputNamedSlot ]),
            body: [
              {
                ...atom(operandResult, operandResult.intSlots.map((_, i) =>
                  i < operandResult.intSlots.length - 1 ? unnamedDLVar : inputNamedSlot
                )),
                aggregate: { type: exp.op, input: inputNamedSlot.dlVar, output: outputNamedSlot.dlVar },
              },
              ...constraintForExtSlots(intExt.extSlots, env.scope),
            ]
          },
        ],
      };
    } else if (exp.type === 'binary' && (exp.op === '=' || exp.op === '<' || exp.op === '>' || exp.op === '=<' || exp.op === '>=')) {
      /***************
       * COMPARISONS *
       ***************/
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (leftResult.intSlots.length !== 1) {
        throw new Error(`Left-hand side of scalar operator must have arity 1`);
      }
      if (rightResult.intSlots.length !== 1) {
        throw new Error(`Right-hand side of scalar operator must have arity 1`);
      }
      if (leftResult.intSlots[0].type !== rightResult.intSlots[0].type) {
        throw new Error(`Scalar operator must have matching types on both sides`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSlots: [ ],
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const leftVar = mkDLVar('left', nextIndex);
      const rightVar = mkDLVar('right', nextIndex);
      const souffleOperator = {
        '=': '=',
        '<': '<',
        '>': '>',
        '=<': '<=',
        '>=': '>=',
      }[exp.op];
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          comment(`${intExt.relName}: ${rangeString(exp.range)} (comparison)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ ]),
            body: [
              atom(leftResult, [ leftVar ]),
              atom(rightResult, [ rightVar ]),
               `(${leftVar} ${souffleOperator} ${rightVar})`,
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (literal)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ namedSlot ]),
            body: [
              `(${namedSlot.dlVar} = ${typeof exp.value === 'string' ? `"${exp.value}"` : exp.value})`,
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
          comment(`${intExt.relName}: ${rangeString(exp.range)} (formula)`),
          decl(intExt, env.scope),
          {
            type: 'rule',
            head: atom(intExt, [ namedSlot ]),
            body: [
              `(${namedSlot.dlVar} = ${exp.formula})`,
              ...constraintForExtSlots(intExt.extSlots, env.scope),
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
      const message = e instanceof Error ? e.message : inspect(e);
      throw new TranslationError(exp, env, new Error(message));
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
