import _ from "lodash";
import { Relation, inferTypes, runSouffle } from "./souffle-run.js";
import { parseRelat } from "./relat-parse.js";
import { IntExt, RelatVariable, RelatVariableBinding, mkNextIndex, mkRelatVarUnsafe, translate, translationResultToFullProgram } from "./relat-to-dl.js";
import { programToString } from "./dl.js";
import { entries, fromEntries } from "./misc.js";

export async function runRelat(code: string, inputs: Record<string, Relation | any[][]>) {
  const inputRelations = _.mapValues(inputs, inferTypes);

  const scope: Record<RelatVariable, RelatVariableBinding & {type: 'relation'}> = fromEntries(
    entries(inputRelations)
    .map(([relName, relation]) => {
      const intExt: IntExt = {
        relName: relName,
        intSlots: relation.types.map((type, i) => ({
          debugName: `${relName}${i}`,
          type,
        })),
        extSlots: [],
      }
      return [mkRelatVarUnsafe(relName), {type: 'relation', intExt}];
    })
  );

  const result = translate(
    parseRelat(code),
    { nextIndex: mkNextIndex(), constraint: [], scope }
  );

  const program = translationResultToFullProgram(result, scope);
  const programString = programToString(program);

  // console.log("runRelat2", inputs, inputRelations)

  // console.log(programString)

  const output = await runSouffle(programString, inputs)

  return output[result.relName]
}
