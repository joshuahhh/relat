import _ from 'lodash';
import { memo, useEffect, useState } from 'react';
import { programToString } from '../dl.js';
import { entries, fromEntries } from '../misc.js';
import { SyntaxError } from '../relat-grammar/relat-grammar.js';
import { parseRelat } from '../relat-parse.js';
import { runRelat } from '../relat-run.js';
import { Environment, IntExt, RelatVariable, RelatVariableBinding, mkNextIndex, mkRelatVarUnsafe, translate, translationResultToFullProgram } from '../relat-to-dl.js';
import { stripMeta, toSexpr } from '../relat.js';
import { Relation, inferTypes } from '../souffle-run.js';

const isPerson: Relation = { types: ["number"], tuples: [
  [10], [11], [12], [13], [20], [21], [22], [23], [30]
] };
const hasChild: Relation = { types: ["number", "number"], tuples: [
  [10, 11],
  [10, 12],
  [10, 13],
  [20, 21],
  [20, 22],
  [20, 23]
] };
const isHappy: Relation = { types: ["number"], tuples: [
  [11], [12], [13], [21], [22]
] };

// `{x : isPerson | some {y : x.hasChild | not y.isHappy}}`
// `{x : isPerson | some (x.hasChild - .isHappy)}`

const inputs = { isPerson, hasChild, isHappy };
const inputRelations = _.mapValues(inputs, inferTypes);

async function process(code: string) {
  try {
    const ast = parseRelat(code);
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

    const env: Environment = {
        nextIndex: mkNextIndex(),
        scope,
        constraint: [],
    };

    const translated = translate(ast, env);
    const fullProgram = translationResultToFullProgram(translated, scope);
    const programString = programToString(fullProgram);

    const output = await runRelat(code, inputs);

    return { ok: true as const, ast, programString, output };
  } catch (e) {
    return { ok: false as const, error: e };
  }
}

export const Root = memo(() => {
  const [ code, setCode ] = useState("{x : isPerson | some {y : x.hasChild | not y.isHappy}}");
  // const [ textAreaHeight, setTextAreaHeight ] = useState(100);

  const [ processed, setProcessed ] = useState<Awaited<ReturnType<typeof process>> | null>(null);
  const [ lastGoodProcessed, setLastGoodProcessed ] = useState<
    (Awaited<ReturnType<typeof process>> & { ok: true }) | null
  >(null);

  useEffect(() => {
    (async () => {
      const processed = await process(code);
      setProcessed(processed);
      if (processed !== null && processed.ok) {
        setLastGoodProcessed(processed);
      }
    })();
  }, [code]);

  return <div style={{
    width: '100%', height: '100%',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
  }}>
    <div style={{minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
      <div style={{display: 'flex', gap: 20, minHeight: 0}}>
        <h1 style={{margin: 0}}>Relative playground</h1>
        <h2 style={{margin: 0}}>inputs</h2>
        {entries(inputs).map(([name, relation]) =>
          <div key={name} style={{minHeight: 0, display: 'flex', flexDirection: 'column'}}>
            <h3 style={{margin: 0}}>{name}</h3>
            <RelationView relation={relation} />
          </div>
        )}
      </div>
    </div>
    <hr style={{width: '100%', border: '0.5px solid hsl(0, 0%, 50%)'}}/>
    <div style={{display: 'grid', gap: 20, gridTemplateColumns: '50% 50%', gridTemplateRows: 'auto', minHeight: 0}}>
      <div style={{gridColumn: 1}}>
        <h2 style={{margin: 0}}>code</h2>
        <textarea
          value={code} onChange={e => {
            setCode(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = (e.target.scrollHeight + 5) + 'px';
          }}
          style={{
            width: "90%",
            // height: textAreaHeight,
            padding: 10,
          }}
        />
        { processed !== null && processed.ok === false && (
            console.log(processed),
            processed.error instanceof SyntaxError
            ? <pre style={{color: 'hsl(0, 50%, 70%)'}}>
                {processed.error.format([{source: code, text: code}]).replace(/^ *--> .*\n/m, '')}
              </pre>
            : <pre style={{color: 'hsl(0, 50%, 70%)'}}>
                {(processed.error as Error).message}
              </pre>
          )
        }
      </div>
      <div style={{gridColumn: 2, opacity: lastGoodProcessed === processed ? 'initial' : '20%'}}>
        <h2 style={{margin: 0}}>ast</h2>
        { lastGoodProcessed === null
        ? <p>processing...</p>
        : <details>
            <summary>
              <pre style={{display: 'inline-block'}}>
                {toSexpr(lastGoodProcessed.ast)}
              </pre>
            </summary>
            <pre>
              {JSON.stringify(stripMeta(lastGoodProcessed.ast), null, 2)}
            </pre>
          </details>
        }
      </div>
      <div style={{gridColumn: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: lastGoodProcessed === processed ? 'initial' : '20%'}}>
        <h2 style={{margin: 0}}>dl</h2>
        { lastGoodProcessed === null
        ? <p>processing...</p>
        : <pre style={{overflow: 'auto'}}>
            {lastGoodProcessed.programString}
          </pre>
        }
      </div>
      <div style={{gridColumn: 2, opacity: lastGoodProcessed === processed ? 'initial' : '20%'}}>
        <h2 style={{margin: 0}}>result</h2>
        { lastGoodProcessed === null
        ? <p>processing...</p>
        : <RelationView relation={lastGoodProcessed.output} />
        }
      </div>
    </div>
  </div>;
});

// const headingByType = {
//   'number': '#',
//   'symbol': 'x',
// };

const RelationView = memo(({ relation }: { relation: Relation }) => {
  if (relation.types.length === 0) {
    if (relation.tuples.length === 0) {
      return <div>FALSE</div>;
    } else {
      return <div>TRUE</div>;
    }
  }
  return <div style={{overflow: 'auto', minHeight: 0}}>
    <table style={{borderCollapse: 'collapse'}}>
      {/* <thead>
        <tr>
          {relation.types.map((type, i) =>
            <th key={i} style={{border: '1px solid hsl(0, 0%, 50%)', padding: 5}}>
              {headingByType[type]}
            </th>
          )}
        </tr>
      </thead> */}
      <tbody>
        {relation.tuples.map((row, i) =>
          <tr key={i}>
            {row.map((value, j) =>
              <td key={j} style={{border: '1px solid hsl(0, 0%, 50%)', padding: 5}}>
                {"" + value}
              </td>
            )}
          </tr>
        )}
      </tbody>
    </table>
  </div>;
});
