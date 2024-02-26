import _ from "lodash";
import { Relation, inferTypes, runSouffle } from "./souffle-run.js";
import { parseRelat } from "./relat-parse.js";
import { makeNextIndex, translate, translationResultToFullProgram } from "./relat-to-dl.js";
import { programToString } from "./dl.js";

export async function runRelat(code: string, inputs: Record<string, Relation | any[][]>) {
  const inputRelations = _.mapValues(inputs, inferTypes);

  const inputRelSigs = _.mapValues(inputRelations, (relation, relName) => relation.types.map((type, i) => ({name: `${relName}${i}`, type})));

  const result = translate(
    parseRelat(code),
    {
      extSig: [],
      constraint: [],
      relScope: _.mapValues(inputRelSigs, (sig, relName) => ({relName, intSig: sig, extSig: []})),
      nextIndex: makeNextIndex(),
    }
  );

  const program = translationResultToFullProgram(result, inputRelSigs);
  const programString = programToString(program);

  // console.log("runRelat2", inputs, inputRelations)

  // console.log(programString)

  const output = await runSouffle(programString, inputs)

  return output[result.relName]
}
