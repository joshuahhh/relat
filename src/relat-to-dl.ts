import _ from 'lodash';
import inspect from 'object-inspect';
import * as DL from './dl.js';
import * as Relat from './relat.js';
import { assertNever } from './misc.js';


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
  | { type: 'relation', rel: SRelation }
      // these come from input relations and `let` bindings

export type Environment = {
  // When you translate a Relat expression, you do so in the context of an
  // Environment.
  nextIndex: () => number,
    // Generator for unique indices.
  scope: Scope,
}

export type Scope = Map<RelatVariable, RelatVariableBinding>;
export type ScopeRelationsOnly = Map<RelatVariable, RelatVariableBinding & { type: 'relation' }>;

function getScalarTypeFromScope(varName: RelatVariable, scope: Scope): DL.Type {
  const type = scope.get(varName);
  if (!type || type.type !== 'scalar') {
    throw new Error(`Variable ${varName} not in scope as scalar`);
  }
  return type.scalarType;
}
function getAllExtSlots(scope: Scope): RelatVariable[] {
  return [...scope.entries()]
    .filter(([_, binding]) => binding.type === 'scalar')
    .map(([name, _]) => name);
}
function mergeExtSlots(slots1: RelatVariable[], slots2: RelatVariable[]): RelatVariable[] {
  return _.uniq([...slots1, ...slots2]);
}

export type SRelation = {
  // SRelation (S for Scoped) describes a relation with internal arguments
  // (those which are actually semantically arguments of the relation) and
  // external arguments (which reflect dependencies on variables in scope).
  name: DL.RelationName,
  debugDesc: string,
  intSlots: IntSlot[],
    // `debugName` is purely a hint for producing more legible output.
  extSlots: RelatVariable[],
    // These variable names are significant, as they bind the SRelation to
    // in-scope Relat variables. Types are not included, as they should be
    // available from the context. Also: these names should all be distinct (per
    // shadowing rules.)
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

// utility: common desire is to generate unique DL vars to go with an
// SRelation's intSlots. here u go
type NamedIntSlot = IntSlot & { name: DL.VariableName };
function nameSlots(intSlots: IntSlot[], nextIndex: () => number): NamedIntSlot[] {
  return intSlots.map((intSig) => nameSlot(intSig, nextIndex));
}
function nameSlot(intSlot: IntSlot, nextIndex: () => number): NamedIntSlot {
  return { ...intSlot, name: mkDLVarUnsafe(`i_${nextIndex()}_${intSlot.debugName}`) };
}

// Translating an expression (in an environment) results in both:
// * an SRelation, which is a relation with internal & external arguments
// * a program which ensures that the relation reflects the desired expression
export type TranslationResult = SRelation & { program: DL.Program }

function mkDLVarUnsafe(name: string) {
  return name as DL.VariableName;
}

function mkDLVar(debugName: string, nextIndex: () => number): DL.VariableName {
  return mkDLVarUnsafe(`v_${nextIndex()}_${debugName}`);
}

const wildcard: DL.VariableName = mkDLVarUnsafe('_');

export function mkRelatVarUnsafe(name: string) {
  return name as RelatVariable;
}

// function comment(s: string): DL.Command {
//   return { type: 'comment', comment: s };
// }

// Produce a decl for a fresh SRelation
// (Choice domains are only supported among int slots; they will all include all ext slots)
function decl({name, debugDesc, intSlots, extSlots}: SRelation, scope: Scope, choiceDomains?: IntSlot[][]): DL.Command {
  const intSlotsInSig = intSlots.map(({ type, debugName }, i) => ({name: mkDLVarUnsafe(`i_${i}_${debugName}`), type}));
  const extSlotsInSig = extSlots.map((name) => ({name: mkDLVarUnsafe(`e_${name}`), type: getScalarTypeFromScope(name, scope)}));
  const choiceDomainsInDL = choiceDomains
    ? choiceDomains.map((domain) => [
        // get names of int slots as used in signature
        ...domain.map((slot) => intSlotsInSig[intSlots.indexOf(slot)].name),
        // and include the ext slots
        ...extSlotsInSig.map((slot) => slot.name),
      ])
    : undefined;
  return [
    {
      type: 'comment',
      comment: `${name}: ${debugDesc}`,
    },
    {
      type: 'decl',
      relName: name,
      sig: [
        ...intSlotsInSig,
        ...extSlotsInSig,
      ],
      choiceDomains: choiceDomainsInDL,
    },
  ];
}

type DLVarish = DL.VariableName | { name: DL.VariableName };
function unDLVarish(v: DLVarish): DL.VariableName {
  return typeof v === 'string' ? v : v.name;
}
function atom(rel: SRelation, intArgs: DLVarish[]): DL.Atom {
  const {name, intSlots, extSlots} = rel;
  if (intArgs.length !== intSlots.length) {
    throw new Error(`Internal error: provided ${intArgs.length} args to relation with ${intSlots.length} intSlots`);
  }
  return {
    relName: name,
    args: [...intArgs.map(unDLVarish), ...extSlots]
  };
}

function ruleScoped(rel: SRelation, headIntArgs: DLVarish[], body: DL.Literal[], scope: Scope): DL.Command {
  const constraintsForExtSlots = rel.extSlots.flatMap((name) => {
    const binding = scope.get(name);
    if (!binding) {
      throw new Error(`Variable ${name} not in scope`);
    }
    if (binding.type !== 'scalar') {
      throw new Error(`Variable ${name} not in scope as scalar`);
    }
    return binding.constraint;
  });

  return {
    type: 'rule',
    head: atom(rel, headIntArgs),
    body: [...body, ...constraintsForExtSlots],
  };
}

function negated(atom: DL.Atom): DL.Literal {
  return { ...atom, negated: true };
}

function aggregate(aggregate: DL.Aggregate, atom: DL.Atom): DL.Literal {
  return { aggregate, ...atom };
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
      const relatVarBinding = env.scope.get(relatVar);
      if (!relatVarBinding) {
        throw new Error(`Unknown identifier: ${exp.name}`);
      } else if (relatVarBinding.type === 'scalar') {
        const resultR: SRelation = {
          name: `R${env.nextIndex()}`,
          debugDesc: `"${Relat.rangeString(exp.range)}" (identifier)`,
          intSlots: [ { type: relatVarBinding.scalarType, debugName: exp.name } ],
          extSlots: [ relatVar, ...relatVarBinding.constraintExtSlots ],
        }
        return {
          ...resultR,
          program: [
            '',
            decl(resultR, env.scope),
            ruleScoped(resultR, [ relatVar ], [ ], env.scope),
          ],
        };
      } else if (relatVarBinding.type === 'relation') {
        return {
          ...relatVarBinding.rel,
          program: [],
        }
      } else {
        assertNever(relatVarBinding);
      }
    } else if (exp.type === 'binary' && exp.op === '.') {
      // TODO: extremely hacked in support for x._ & _.x
      if (exp.left.type === 'identifier' && exp.left.name === '_') {
        return translate(Relat.addMeta(Relat.o('[_]', exp.right), { range: exp.range }), env);
      }
      if (exp.right.type === 'identifier' && exp.right.name === '_') {
        const operandR = translate(exp.left, env);
        if (operandR.intSlots.length === 0) {
          throw new Error(`Cannot apply wildcard to relation with arity 0`);
        }
        const operandNamedSlots = nameSlots(operandR.intSlots, nextIndex);
        const resultR: SRelation = {
          name: `R${env.nextIndex()}`,
          debugDesc: `"${Relat.rangeString(exp.range)}" (wildcard application)`,
          intSlots: operandNamedSlots.slice(0, -1),
          extSlots: operandR.extSlots,
        };
        return {
          ...resultR,
          program: [
            operandR.program,
            '',
            decl(resultR, env.scope),
            ruleScoped(resultR, operandNamedSlots.slice(0, -1), [
              atom(operandR, [ ...operandNamedSlots.slice(0, -1), wildcard ])
            ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (dot-join)`,
        intSlots: joinNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, joinNamedSlots, [
            atom(leftResult, leftNamedSlots),
            atom(rightResult, [_.last(leftNamedSlots)!, ..._.tail(rightNamedSlots)]),
          ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (cartesian product)`,
        intSlots: joinNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, joinNamedSlots, [
            atom(leftResult, leftNamedSlots),
            atom(rightResult, rightNamedSlots),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'comprehension' || exp.type === 'comprehension-alt') {
      /*****************
       * COMPREHENSION * (inc. "alt comprehension")
       *****************/
      const isAlt = exp.type === 'comprehension-alt';
      const newRelatVars = exp.variables.map(mkRelatVarUnsafe);
      for (const newRelatVar of newRelatVars) {
        if (env.scope.has(newRelatVar)) {
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
        scope: new Map([
          ...env.scope,
          ...newRelatVars.map((newRelatVar, i) => [
            newRelatVar,
            {
              type: 'scalar',
              scalarType: newIntSlots[i].type,
              constraint: atom(constraintResult, constraintResult.intSlots.map((_, j) => j === i ? newRelatVar : wildcard)),
              constraintExtSlots: constraintResult.extSlots,
            },
          ] as const),
        ]),
      };
      const bodyResult = translate(exp.body, envForBody);
      const bodyNamedSlots = nameSlots(bodyResult.intSlots, nextIndex);
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (comprehension)`,
        intSlots: [ ...isAlt ? [] : newIntSlots, ...bodyNamedSlots ],
        extSlots: _.difference(bodyResult.extSlots, newRelatVars),
      };
      return {
        ...resultR,
        program: [
          ...constraintResult.program,
          ...bodyResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [ ...isAlt ? [] : newRelatVars, ...bodyNamedSlots ], [
            atom(constraintResult, newRelatVars),
            atom(bodyResult, bodyNamedSlots),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'unary' && exp.op === 'some') {
      /********
       * SOME *
       ********/
      const operandR = translate(exp.operand, env);
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (some)`,
        intSlots: [],
        extSlots: operandR.extSlots,
      };

      const operandNamedSlots = nameSlots(operandR.intSlots, nextIndex);
      return {
        ...resultR,
        program: [
          operandR.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [], [
            atom(operandR, operandNamedSlots.map(() => wildcard)),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'unary' && exp.op === 'not') {
      /*******
       * NOT *
       *******/
      const operandR = translate(exp.operand, env);
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (not)`,
        intSlots: [],
        extSlots: operandR.extSlots,
      };
      const operandNamedSlots = nameSlots(operandR.intSlots, nextIndex);
      return {
        ...resultR,
        program: [
          operandR.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [], [
            negated(atom(operandR, operandNamedSlots.map(() => wildcard))),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'unary' && exp.op === '^') {
      /******************************
       * TRANSITIVE CLOSURE (^ / *) *
       ******************************/
      const operandR = translate(exp.operand, env);
      if (operandR.intSlots.length !== 2) {
        throw new Error(`Transitive closure must have arity 2`);
      }
      if (operandR.intSlots[0].type !== operandR.intSlots[1].type) {
        throw new Error(`Transitive closure must have same type for both arguments`);
      }
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (transitive closure)`,
        intSlots: operandR.intSlots,
        extSlots: operandR.extSlots,
      };
      const operandNamedSlots = nameSlots(operandR.intSlots, nextIndex);
      const middleVar = mkDLVar('middle', nextIndex);
      return {
        ...resultR,
        program: [
          operandR.program,
          '',
          decl(resultR, env.scope),
          // 1. new relation includes old relation
          ruleScoped(resultR, operandNamedSlots, [
            atom(operandR, operandNamedSlots),
          ], env.scope),
          // 2. new relation includes transitive closure of old relation
          ruleScoped(resultR, operandNamedSlots, [
            atom(resultR, [ operandNamedSlots[0], middleVar ]),
            atom(operandR, [ middleVar, operandNamedSlots[1] ]),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'unary' && exp.op === '~') {
      /*************
       * TRANSPOSE *
       *************/
      // result(B, A) :- operand(A, B)
      const operandR = translate(exp.operand, env);
      if (operandR.intSlots.length !== 2) {
        throw new Error(`Transpose must have arity 2`);
      }
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (transpose)`,
        intSlots: [ operandR.intSlots[1], operandR.intSlots[0] ],
        extSlots: operandR.extSlots,
      };
      const operandNamedSlots = nameSlots(operandR.intSlots, nextIndex);
      return {
        ...resultR,
        program: [
          operandR.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [ operandNamedSlots[1], operandNamedSlots[0] ], [
            atom(operandR, operandNamedSlots),
          ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (union)`,
        intSlots: leftResult.intSlots,  // TODO: debugName from left? meh why not
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const namedSlots = nameSlots(resultR.intSlots, nextIndex);
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, namedSlots, [
            atom(leftResult, namedSlots),
          ], env.scope),
          ruleScoped(resultR, namedSlots, [
            atom(rightResult, namedSlots),
          ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (intersection)`,
        intSlots: leftResult.intSlots,  // TODO: debugName from left? meh why not
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const namedSlots = nameSlots(resultR.intSlots, nextIndex);
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, namedSlots, [
            atom(leftResult, namedSlots),
            atom(rightResult, namedSlots),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'binary' && exp.op === '\\') {
      /**************
       * DIFFERENCE *
       **************/
      // result(A...) :- left(A...), !right(A...)
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!slotTypesMatch(leftResult.intSlots, rightResult.intSlots)) {
        throw new Error(`Relations in difference must have matching signatures, but got ${inspect(leftResult.intSlots)} and ${inspect(rightResult.intSlots)}`);
      }
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (difference)`,
        intSlots: leftResult.intSlots,  // TODO: debugName from left? meh why not
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const namedSlots = nameSlots(resultR.intSlots, nextIndex);
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, namedSlots, [
            atom(leftResult, namedSlots),
            negated(atom(rightResult, namedSlots)),
          ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (application)`,
        intSlots: resultNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, resultNamedSlots, [
            atom(leftResult, leftNamedSlots),
            atom(rightResult, leftNamedSlots.slice(0, rightResult.intSlots.length)),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'unary' && exp.op === '[_]') {
      /************************
       * WILDCARD APPLICATION * (hacky stopgap)
       ************************/
      const operandR = translate(exp.operand, env);
      if (operandR.intSlots.length === 0) {
        throw new Error(`Cannot apply wildcard to relation with arity 0`);
      }
      const operandNamedSlots = nameSlots(operandR.intSlots, nextIndex);
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (wildcard application)`,
        intSlots: operandNamedSlots.slice(1),
        extSlots: operandR.extSlots,
      };
      return {
        ...resultR,
        program: [
          operandR.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, operandNamedSlots.slice(1), [
            atom(operandR, [ wildcard, ...operandNamedSlots.slice(1) ]),
          ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (prefix join)`,
        intSlots: rightNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, rightNamedSlots, [
            atom(leftResult, rightNamedSlots.slice(0, leftResult.intSlots.length)),
            atom(rightResult, rightNamedSlots),
          ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (suffix join)`,
        intSlots: leftNamedSlots,
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, leftNamedSlots, [
            atom(leftResult, leftNamedSlots),
            atom(rightResult, leftNamedSlots.slice(leftResult.intSlots.length - rightResult.intSlots.length)),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'let') {
      /*******
       * LET *
       *******/
      const newRelatVar: RelatVariable = mkRelatVarUnsafe(exp.variable);
      const relatVarBinding = env.scope.get(newRelatVar);
      if (relatVarBinding) {
        throw new Error(`Variable ${exp.variable} already in scope`);
      }
      const valueResult = translate(exp.value, env);
      const envForBody: Environment = {
        ...env,
        scope: new Map([
          ...env.scope,
          [newRelatVar, { type: 'relation', rel: valueResult }],
        ]),
      };
      const bodyResult = translate(exp.body, envForBody);
      return {
        ...bodyResult,
        program: [
          valueResult.program,
          bodyResult.program,
        ],
      };
    } else if (exp.type === 'unary' && exp.op === '#') {
      /*********
       * COUNT *
       *********/
      const operandR = translate(exp.operand, env);
      const countNamedSlot: NamedIntSlot = {
        name: mkDLVar('count', nextIndex),
        type: 'number',
        debugName: 'count',
      };
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (count)`,
        intSlots: [ countNamedSlot ],
        extSlots: operandR.extSlots,
      };
      return {
        ...resultR,
        program: [
          operandR.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [ countNamedSlot ], [
            aggregate({ type: 'count', output: countNamedSlot.name },
              atom(operandR, operandR.intSlots.map(() => wildcard))
            ),
          ], env.scope),
        ],
      };
    } else if (exp.type === 'unary' && (exp.op === 'min' || exp.op === 'max' || exp.op === 'sum')) {
      /***************
       * MIN/MAX/SUM *
       ***************/
      const operandR = translate(exp.operand, env);
      if (operandR.intSlots.length === 0) {
        throw new Error(`Cannot ${exp.op} relation with arity 0`);
      }
      const inputNamedSlot: NamedIntSlot = nameSlot(operandR.intSlots[operandR.intSlots.length - 1], nextIndex)
      if (inputNamedSlot.type !== 'number') {
        throw new Error(`Cannot ${exp.op} relation with non-number last argument`);
      }
      const outputNamedSlot: NamedIntSlot = {
        name: mkDLVar(exp.op, nextIndex),
        type: 'number',
        debugName: exp.op,
      };
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (${exp.op})`,
        intSlots: [ outputNamedSlot ],
        extSlots: operandR.extSlots,
      };
      return {
        ...resultR,
        program: [
          operandR.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [ outputNamedSlot ], [
            aggregate({ type: exp.op, input: inputNamedSlot.name, output: outputNamedSlot.name },
              atom(operandR, operandR.intSlots.map((_, i) =>
                i < operandR.intSlots.length - 1 ? wildcard : inputNamedSlot
              ))
            ),
          ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (${exp.op})`,
        intSlots: [ ],
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const leftVar = mkDLVar('left', nextIndex);
      const rightVar = mkDLVar('right', nextIndex);
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [], [
            atom(leftResult, [ leftVar ]),
            atom(rightResult, [ rightVar ]),
             `(${leftVar} ${exp.op} ${rightVar})`,
          ], env.scope),
        ],
      };
    } else if (exp.type === 'binary' && (exp.op === '+' || exp.op === '-' || exp.op === '*' )) {
      /**************
       * ARITHMETIC *
       **************/
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (leftResult.intSlots.length !== 1 || leftResult.intSlots[0].type !== 'number') {
        throw new Error(`Left-hand side of arithmetic must be numeric`);
      }
      if (rightResult.intSlots.length !== 1 || rightResult.intSlots[0].type !== 'number') {
        throw new Error(`Right-hand side of arithmetic must be numeric`);
      }
      const resultVar = nameSlot({ type: 'number', debugName: 'arith' }, nextIndex);
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (${exp.op})`,
        intSlots: [ resultVar ],
        extSlots: mergeExtSlots(leftResult.extSlots, rightResult.extSlots),
      };
      const leftVar = mkDLVar('left', nextIndex);
      const rightVar = mkDLVar('right', nextIndex);
      return {
        ...resultR,
        program: [
          leftResult.program,
          rightResult.program,
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [ resultVar ], [
            atom(leftResult, [ leftVar ]),
            atom(rightResult, [ rightVar ]),
             `(${resultVar.name} = ${leftVar} ${exp.op} ${rightVar})`,
          ], env.scope),
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
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (constant)`,
        intSlots: [ namedSlot ],
        extSlots: [ ],
      };
      return {
        ...resultR,
        program: [
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [ namedSlot ], [
            `(${namedSlot.name} = ${typeof exp.value === 'string' ? `${JSON.stringify(exp.value)}` : exp.value})`,
          ], env.scope),
        ],
      };
    } if (exp.type === 'formula') {
      /***********
       * FORMULA *
       ***********/
      // TODO: guess we're assuming it's a number? hmmmmm
      const namedSlot = nameSlot({debugName: 'formula', type: 'number' }, nextIndex);
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (formula)`,
        intSlots: [ namedSlot ],
        extSlots: getAllExtSlots(env.scope),  // TODO: guess we should parse & constrain this?
      };
      return {
        ...resultR,
        program: [
          '',
          decl(resultR, env.scope),
          ruleScoped(resultR, [ namedSlot ], [
            `(${namedSlot.name} = ${exp.formula})`,
          ], env.scope),
        ],
      };
    } if (exp.type === 'unary' && exp.op === 'index') {
      // .decl result(A, N) choice-domain A, N
      // result(A, 0) :- operand(A)
      // result(A, N + 1) :- result(_, N), operand(A)
      const operandR = translate(exp.operand, env);
      const operandNamedSlots = nameSlots(operandR.intSlots, nextIndex);
      const nNamedSlot = nameSlot({debugName: 'index', type: 'number' }, nextIndex);
      const nPlus1NamedSlot = nameSlot({debugName: 'indexPlus1', type: 'number' }, nextIndex);
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (${exp.op})`,
        intSlots: [ ...operandNamedSlots, nNamedSlot ],
        extSlots: operandR.extSlots,
      };
      return {
        ...resultR,
        program: [
          operandR.program,
          '',
          decl(resultR, env.scope, [operandNamedSlots, [nNamedSlot]]),
          ruleScoped(resultR, [ ...operandNamedSlots, nNamedSlot ], [
            atom(operandR, operandNamedSlots),
            `${nNamedSlot.name} = 0`,
          ], env.scope),
          ruleScoped(resultR, [ ...operandNamedSlots, nPlus1NamedSlot ], [
            atom(resultR, [ ...operandNamedSlots.map(() => wildcard), nNamedSlot ]),
            atom(operandR, operandNamedSlots),
            `${nPlus1NamedSlot.name} = ${nNamedSlot.name} + 1`,
          ], env.scope),
        ],
      };
    } else if (exp.type === 'unary' && exp.op === 'concat') {
      // construct index_operand
      // acc(A, 0) :- index_operand(_..., A, 0)
      // acc(A + B, N + 1) :- acc(A, N), index_operand(_..., B, N + 1)
      // top_index(N) :- N = max M : index_operand(_..., M)
      // result(A) :- acc(A, N), top_index(N)

      // TODO: process below is unconventional & messy

      // we translate the operand directly just to check type
      {
        const operandR = translate(exp.operand, env);
        if (operandR.intSlots.length === 0) {
          throw new Error(`Cannot ${exp.op} relation with arity 0`);
        }
        if (operandR.intSlots[operandR.intSlots.length - 1].type !== 'symbol') {
          throw new Error(`Cannot ${exp.op} relation with non-symbol last argument`);
        }
      }
      // now we translate "index operand" for real
      const indexOperandR = translate(Relat.addMeta(Relat.o('index', exp.operand), { range: exp.range }), env);
      const inputSlot = indexOperandR.intSlots[indexOperandR.intSlots.length - 2];
      const aNamedSlot = nameSlot(inputSlot, nextIndex);
      const bNamedSlot = nameSlot(inputSlot, nextIndex);
      const aPlusBNamedSlot = nameSlot(inputSlot, nextIndex);
      const nNamedSlot = nameSlot({debugName: 'index', type: 'number' }, nextIndex);
      const mNamedSlot = nameSlot({debugName: 'index', type: 'number' }, nextIndex);
      const nPlus1NamedSlot = nameSlot({debugName: 'indexPlus1', type: 'number' }, nextIndex);
      const accR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (concat: accumulator)`,
        intSlots: [ aNamedSlot, nNamedSlot ],
        extSlots: indexOperandR.extSlots,
      };
      const topIndexR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (concat: top index)`,
        intSlots: [ nNamedSlot ],
        extSlots: indexOperandR.extSlots,
      };
      const resultR: SRelation = {
        name: `R${env.nextIndex()}`,
        debugDesc: `"${Relat.rangeString(exp.range)}" (concat)`,
        intSlots: [ aNamedSlot ],
        extSlots: indexOperandR.extSlots,
      };
      return {
        ...resultR,
        program: [
          ...indexOperandR.program,
          '',
          decl(accR, env.scope),
          ruleScoped(accR, [ aNamedSlot, nNamedSlot ], [
            atom(indexOperandR, [ ...indexOperandR.intSlots.slice(0, -2).map(() => wildcard), aNamedSlot, nNamedSlot ]),
            `${nNamedSlot.name} = 0`,
          ], env.scope),
          ruleScoped(accR, [ aPlusBNamedSlot, nPlus1NamedSlot ], [
            atom(accR, [ aNamedSlot, nNamedSlot ]),
            atom(indexOperandR, [ ...indexOperandR.intSlots.slice(0, -2).map(() => wildcard), bNamedSlot, nPlus1NamedSlot ]),
            `${nPlus1NamedSlot.name} = ${nNamedSlot.name} + 1`,
            `${aPlusBNamedSlot.name} = ${aNamedSlot.name} + "," + ${bNamedSlot.name}`,
          ], env.scope),
          decl(topIndexR, env.scope),
          ruleScoped(topIndexR, [ nNamedSlot ], [
            aggregate({ type: 'max', input: mNamedSlot.name, output: nNamedSlot.name },
              atom(indexOperandR, [ ...indexOperandR.intSlots.slice(0, -1).map(() => wildcard), mNamedSlot.name]),
            ),
          ], env.scope),
          decl(resultR, env.scope),
          ruleScoped(resultR, [ aNamedSlot ], [
            atom(accR, [ aNamedSlot, nNamedSlot ]),
            atom(topIndexR, [ nNamedSlot ]),
          ], env.scope),
        ],
      }
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
  scope: ScopeRelationsOnly
): DL.Program {
  return [
    [...scope].flatMap(([relName, { rel }]) => [
      decl(rel, new Map()),
      { type: 'input', relName } satisfies DL.Command,
    ]),
    '',
    ...result.program,
    '',
    {
      type: 'output',
      relName: result.name,
    }
  ];
}
