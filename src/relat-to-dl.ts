import * as Relat from './relat.js';
import * as DL from './dl.js';

import _ from 'lodash';
import { rangeString } from './relat.js';
import inspect from 'object-inspect';

function externalVarByName(myName: DL.VariableName, extSig: DL.TypedVariable[]): DL.TypedVariable | undefined {
  return extSig.find(({name}) => name === myName);
}

export function makeNextIndex() {
  let i = 0;
  return () => { return ++i; }
}

export type Environment = {
  // When you translate a Relat expression, you do so in the context of an
  // Environment.
  nextIndex: () => number,
    // Generator for unique indices.
  extSig: DL.TypedVariable[],
    // extSig gives the types of scalar variables in scope. TODO: make this a record?
  constraint: DL.Literal[],
    // constraint gives literals that constrain variables in extSig. For
    // example, if we are translating a subexpression inside a comprehension,
    // then the constraint will be the literals that constrain the comprehension
    // variables. This is important to make sure that all variables are
    // grounded.
  relScope: Record<string, IntExt>,
    // relScope gives the types of relations in scope. These relations can come
    // from input relations or from `let` bindings.
}

type IntExt = {
  // IntExt describes a relation with internal arguments (those which are
  // actually semantically arguments of the relation) and external arguments
  // (which reflect dependencies on variables in scope).
  relName: DL.RelationName,
  intSig: DL.TypedVariable[],
    // Types in intSig are significant, but names are only for readability.
  extSig: DL.TypedVariable[],
    // Both types and names in extSig are significant, as their names bind them
    // with in-scope variables.

  // Note: names in intSig and extSig are not necessarily disjoint.
}

export type TranslationResult = IntExt & { program: DL.Program }

function mapNames(sig: DL.TypedVariable[], funcOrTemplate: ((name: DL.VariableName) => DL.VariableName) | string): DL.TypedVariable[] {
  let func: (name: DL.VariableName) => DL.VariableName;
  if (typeof funcOrTemplate === 'string') {
    const template = funcOrTemplate;
    func = (name: DL.VariableName) => template.replace('NAME', name);
  } else {
    func = funcOrTemplate;
  }
  return sig.map(({name, type}) => ({name: func(name), type}));
}

function decl({relName, intSig, extSig}: IntExt): DL.Command {
  return {
    type: 'decl',
    relName,
    sig: [
      ...mapNames(intSig, "NAME_i"),
      ...mapNames(extSig, "NAME_e"),
    ],
  };
}

function sigsMatch(sig1: DL.TypedVariable[], sig2: DL.TypedVariable[]): boolean {
  if (sig1.length !== sig2.length) {
    return false;
  }
  for (let i = 0; i < sig1.length; i++) {
    if (sig1[i].type !== sig2[i].type) {
      return false;
    }
  }
  return true;
}

function atom({relName, intSig, extSig}: IntExt, intArgs?: DL.TypedVariable[], extArgs?: DL.TypedVariable[]): DL.Atom {
  if ((intArgs || extArgs) && !(intArgs && extArgs)) {
    throw new Error(`Internal and external args must either both be specified or both be omitted`);
  }
  intArgs = intArgs || intSig;
  extArgs = extArgs || extSig;
  if (!sigsMatch(intSig, intArgs)) {
    throw new Error(`internal args ${JSON.stringify(intArgs)} does not match ${JSON.stringify(intSig)}`);
  }
  if (!sigsMatch(extSig, extArgs)) {
    throw new Error(`external args ${JSON.stringify(extArgs)} does not match ${JSON.stringify(extSig)}`);
  }

  return {
    relName,
    args: names([...intArgs, ...extArgs]),
  };
}

function names(sig: DL.TypedVariable[]): DL.VariableName[] {
  return sig.map(({name}) => name);
}

export function translate(exp: Relat.Expression, env: Environment): TranslationResult {
  try {
    // console.log('translate', rangeString(exp.range), env);

    if (exp.type === 'identifier') {
      /**************
       * IDENTIFIER *
       **************/
      const externalVar = externalVarByName(exp.name, env.extSig);
      if (externalVar) {
        const intExt: IntExt = {
          relName: `R${env.nextIndex()}`,
          intSig: [ externalVar ],
          extSig: env.extSig,
        }
        return {
          ...intExt,
          program: [
            '',
            `// ${intExt.relName}: ${rangeString(exp.range)} (identifier)`,
            decl(intExt),
            {
              type: 'rule',
              head: atom(intExt),
              body: [ ...env.constraint ],
            }
          ],
        };
      } else if (exp.name in env.relScope) {
        return {
          ...env.relScope[exp.name],
          program: [],
        }
      } else {
        throw new Error(`Unknown identifier: ${exp.name}`);
      }
    } else if (exp.type === 'binary' && exp.op === '.') {
      /************
       * DOT-JOIN *
       ************/
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (leftResult.intSig.length === 0) {
        throw new Error(`Left-hand side of dot-join must have arity > 0`);
      }
      if (rightResult.intSig.length === 0) {
        throw new Error(`Right-hand side of dot-join must have arity > 0`);
      }
      if (_.last(leftResult.intSig)!.type !== _.first(rightResult.intSig)!.type) {
        throw new Error(`Last argument of left-hand side of dot-join must have same type as first argument of right-hand side`);
      }
      // names may overlap; rename them
      const leftSigPrefix = mapNames(leftResult.intSig, "NAME_l");
      const rightSigPrefix = mapNames(rightResult.intSig, "NAME_r");
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSig: [
          ..._.dropRight(leftSigPrefix, 1),
          ..._.drop(rightSigPrefix, 1),
        ],
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (dot-join)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(leftResult, leftSigPrefix, leftResult.extSig),
              atom(rightResult, rightSigPrefix, rightResult.extSig),
              `${_.last(leftSigPrefix)!.name} = ${_.first(rightSigPrefix)!.name}`,
              ...env.constraint,
            ],
          },
        ],
      };
    } else if (exp.type === 'comprehension') {
      /*****************
       * COMPREHENSION *
       *****************/
      if (exp.variable in env.relScope || externalVarByName(exp.variable, env.extSig)) {
        throw new Error(`Variable ${exp.variable} already in scope`);
      }
      const constraintResult = translate(exp.constraint, env);
      if (constraintResult.intSig.length !== 1) {
        throw new Error(`Constraint of comprehension must have arity 1`);
      }
      const newVariable: DL.TypedVariable = { name: exp.variable, type: constraintResult.intSig[0].type };
      const envForBody: Environment = {
        ...env,
        extSig: [ ...env.extSig, newVariable ],
        constraint: [
          ...env.constraint,
          atom(constraintResult, [newVariable], constraintResult.extSig)
        ],
      };
      const bodyResult = translate(exp.body, envForBody);
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSig: [
          newVariable,
          ...bodyResult.intSig,
        ],
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...constraintResult.program,
          ...bodyResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (comprehension)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(bodyResult),
              ...env.constraint,
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
        intSig: [],
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (some)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(operandResult,
                operandResult.intSig.map(({type}) => ({name: '_', type})),
                operandResult.extSig
              ),
              ...env.constraint,
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
        intSig: [],
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (not)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              {
                ...atom(operandResult,
                  operandResult.intSig.map(({type}) => ({name: '_', type})),
                  operandResult.extSig
                ),
                negated: true,
              },
              ...env.constraint,
            ],
          },
        ],
      };
    } else if (exp.type === 'unary' && (exp.op === '^' || exp.op === '*')) {
      /******************************
       * TRANSITIVE CLOSURE (^ / *) *
       ******************************/
      if (exp.op === '*') {
        throw new Error(`Reflexive transitive closure (^) not yet implemented`);
      }
      const operandResult = translate(exp.operand, env);
      if (operandResult.intSig.length !== 2) {
        throw new Error(`Transitive closure must have arity 2`);
      }
      if (operandResult.intSig[0].type !== operandResult.intSig[1].type) {
        throw new Error(`Transitive closure must have same type for both arguments`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSig: operandResult.intSig,
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (transitive closure)`,
          decl(intExt),
          // 1. new relation includes old relation
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(operandResult),
              ...env.constraint,
            ],
          },
          // 2. new relation includes transitive closure of old relation
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(intExt, [ intExt.intSig[0], { name: 'middle', type: intExt.intSig[0].type }, ...intExt.extSig ]),
              atom(operandResult, [ intExt.intSig[1], { name: 'middle', type: intExt.intSig[0].type }, ...operandResult.extSig ]),
              ...env.constraint,
            ],
          },
        ],
      };
    } else if (exp.type === 'unary' && exp.op === '~') {
      /*************
       * TRANSPOSE *
       *************/
      const operandResult = translate(exp.operand, env);
      if (operandResult.intSig.length !== 2) {
        throw new Error(`Transpose must have arity 2`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSig: [ operandResult.intSig[1], operandResult.intSig[0] ],
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (transpose)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(operandResult, [ intExt.intSig[1], intExt.intSig[0] ], operandResult.extSig),
              ...env.constraint,
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === '+') {
      /*********
       * UNION *
       *********/
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!sigsMatch(leftResult.intSig, rightResult.intSig)) {
        throw new Error(`Relations in union must have matching signatures, but got ${inspect(leftResult.intSig)} and ${inspect(rightResult.intSig)}`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        // TODO: this prefixing is a stop-gap; I need a more principled way of avoiding name collisions!
        intSig: mapNames(leftResult.intSig, 'NAME_'),
        // TODO: union extSigs
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (union)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(leftResult, intExt.intSig, leftResult.extSig),
              ...env.constraint,
            ],
          },
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(rightResult, intExt.intSig, rightResult.extSig),
              ...env.constraint,
            ],
          },
        ],
      };
    } else if (exp.type === 'binary' && exp.op === '&') {
      /****************
       * INTERSECTION *
       ****************/
      const leftResult = translate(exp.left, env);
      const rightResult = translate(exp.right, env);
      if (!sigsMatch(leftResult.intSig, rightResult.intSig)) {
        throw new Error(`Relations in intersection must have matching signatures, but got ${inspect(leftResult.intSig)} and ${inspect(rightResult.intSig)}`);
      }
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        // TODO: this prefixing is a stop-gap; I need a more principled way of avoiding name collisions!
        intSig: mapNames(leftResult.intSig, 'NAME_'),
        // TODO: union extSigs
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...leftResult.program,
          ...rightResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (intersection)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              atom(leftResult, intExt.intSig, leftResult.extSig),
              atom(rightResult, intExt.intSig, rightResult.extSig),
              ...env.constraint,
            ],
          },
        ],
      };
    } else if (exp.type === 'let') {
      /*******
       * LET *
       *******/
      if (exp.variable in env.relScope || externalVarByName(exp.variable, env.extSig)) {
        throw new Error(`Variable ${exp.variable} already in scope`);
      }
      const valueResult = translate(exp.value, env);
      const envForBody: Environment = {
        ...env,
        relScope: {
          ...env.relScope,
          [exp.variable]: valueResult,
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
      const newVariable: DL.TypedVariable = { name: 'cnt', type: 'number' };
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSig: [ newVariable ],
        extSig: env.extSig,
      };
      return {
        ...intExt,
        program: [
          ...operandResult.program,
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (count)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              {
                ...atom(operandResult,
                  operandResult.intSig.map(({type}) => ({name: '_', type})),
                  operandResult.extSig),
                counting: newVariable.name,
              },
              ...env.constraint,
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
      if (leftResult.intSig.length !== 1) {
        throw new Error(`Left-hand side of scalar operator must have arity 1`);
      }
      if (rightResult.intSig.length !== 1) {
        throw new Error(`Right-hand side of scalar operator must have arity 1`);
      }
      // TODO: type-checking of left and right sides
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSig: [ ],
        extSig: env.extSig,
      };
      const leftVar = {name: 'leftVar', type: leftResult.intSig[0].type};
      const rightVar = {name: 'rightVar', type: rightResult.intSig[0].type};
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
          `// ${intExt.relName}: ${rangeString(exp.range)} (comparison)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt),
            body: [
              {
                ...atom(leftResult,
                  [ leftVar ],
                  leftResult.extSig),
               },
               {
                ...atom(rightResult,
                  [ rightVar ],
                  rightResult.extSig),
               },
               `(${leftVar.name} ${souffleOperator} ${rightVar.name})`,
              ...env.constraint,
            ]
          },
        ],
      };
    } else if (exp.type === 'constant') {
      const relVar: DL.TypedVariable = { name: 'relVar', type: typeof exp.value === 'string' ? 'symbol' : 'number' };
      const intExt: IntExt = {
        relName: `R${env.nextIndex()}`,
        intSig: [ relVar ],
        extSig: [ ],
      };
      return {
        ...intExt,
        program: [
          '',
          `// ${intExt.relName}: ${rangeString(exp.range)} (literal)`,
          decl(intExt),
          {
            type: 'rule',
            head: atom(intExt, [ relVar ], [ ]),
            body: [
              `(${relVar.name} = ${typeof exp.value === 'string' ? `"${exp.value}"` : exp.value})`,
            ],
          },
        ],
      };
    } else {
      // const _exhaustiveCheck: never = exp;
      // void(_exhaustiveCheck);
      throw new Error(`Unexpected expression (${JSON.stringify(exp)})`);
    }
  } catch (e) {
    if (e instanceof Error && !e.message.startsWith('Translating ')) {
      e.message = `Translating ${exp.type} ${rangeString(exp.range)}: ${e.message}`;
    }
    throw e
  }
}

export function translationResultToFullProgram(result: TranslationResult, inputRelSigs: Record<string, DL.TypedVariable[]>): DL.Program {
  return [
    ...Object.entries(inputRelSigs).flatMap(([relName, sig]) => [
      {
        type: 'decl',
        relName,
        sig,
      },
      {
        type: 'input',
        relName,
      },
    ] satisfies DL.Command[]),
    '',
    ...result.program,
    '',
    {
      type: 'output',
      relName: result.relName,
    }
  ];
}
