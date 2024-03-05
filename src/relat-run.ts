import _ from "lodash";
import { programToString } from "./dl.js";
import { entries } from "./misc.js";
import { parseRelat } from "./relat-parse.js";
import { SRelation, ScopeRelationsOnly, mkNextIndex, mkRelatVarUnsafe, translate, translationResultToFullProgram } from "./relat-to-dl.js";
import { Relation, inferTypes, runSouffle } from "./souffle-run.js";

export async function runRelat(code: string, inputs: Record<string, Relation | any[][]>) {
  const inputRelations = _.mapValues(inputs, inferTypes);

  const scope: ScopeRelationsOnly = new Map(
    entries(inputRelations)
    .map(([relName, relation]) => {
      const rel: SRelation = {
        name: relName,
        debugDesc: 'input relation',
        intSlots: relation.types.map((type, i) => ({
          debugName: `${relName}${i}`,
          type,
        })),
        extSlots: [],
      }
      return [mkRelatVarUnsafe(relName), {type: 'relation', rel}];
    })
  );

  const result = translate(
    parseRelat(code),
    { nextIndex: mkNextIndex(), scope }
  );

  const program = translationResultToFullProgram(result, scope);
  const programString = programToString(program);

  const output = await runSouffle('.pragma "magic-transform" "*"\n' + programString, inputs);

  return {
    ...output[result.name],
    // We know the actual signature, so substitute that in.
    // (Helps if, say, the result set is empty.)
    types: result.intSlots.map(slot => slot.type),
  };
}
