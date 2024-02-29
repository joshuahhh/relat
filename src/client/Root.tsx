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
import clsx from 'clsx';
import { Scenario, scenarios } from './scenarios.js';

async function process(code: string, inputs: Record<string, Relation>) {
  try {
    const ast = parseRelat(code);
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

    const env: Environment = {
        nextIndex: mkNextIndex(),
        scope,
        constraint: [],
    };

    const translated = translate(ast, env);
    const fullProgram = translationResultToFullProgram(translated, scope);
    const programString = programToString(fullProgram);

    const output = await runRelat(code, inputs);

    return { ok: true as const, ast, translated, programString, output };
  } catch (e) {
    return { ok: false as const, error: e };
  }
}

export const Root = memo(() => {
  const [ scenario, setScenario ] = useState<Scenario>(scenarios[0]);
  const [ code, setCode ] = useState(scenario.examples[0].code);
  // const [ textAreaHeight, setTextAreaHeight ] = useState(100);

  const [ processed, setProcessed ] = useState<Awaited<ReturnType<typeof process>> | null>(null);
  const [ lastGoodProcessed, setLastGoodProcessed ] = useState<
    (Awaited<ReturnType<typeof process>> & { ok: true }) | null
  >(null);

  useEffect(() => {
    (async () => {
      const processed = await process(code, scenario.inputs);
      setProcessed(processed);
      if (processed !== null && processed.ok) {
        setLastGoodProcessed(processed);
      }
    })();
  }, [code, scenario.inputs]);

  return <div className='flex flex-col p-6 w-full h-full'>
    <div className="flex flex-row gap-10 h-1/3">
      <div>
        <h1 className='text-5xl'>relat</h1>
        <div className='h-4'/>
        {scenarios.map((s, i) =>
          <button key={i}
            className={clsx(
              'block text-[#646cff] hover:text-[#535bf2] text-left',
              s === scenario && 'font-bold'
            )}
            onClick={() => {
              setScenario(s);
              setCode(s.examples[0].code);
            }}
          >
            {s.name}
          </button>
        )}
      </div>
      <div className='flex flex-row gap-10 overflow-x-scroll'>
        {entries(scenario.inputs).map(([name, relation]) =>
          <div key={name} className="flex flex-col items-start w-fit">
            <h3 className='text-lg font-bold'>{name}</h3>
            <div className='overflow-y-scroll w-fit'>
              <RelationView relation={relation} />
            </div>
          </div>
        )}
      </div>
    </div>
    <hr className='min-h-px my-4 bg-gray-500 border-0'/>
    <div className='flex flex-row min-h-0 gap-8'>
      <div className='flex flex-col w-1/2'>
        <h2 className='text-xl font-bold'>try out...</h2>
        {scenario.examples.map((example, i) =>
          <button key={i} className='block text-[#646cff] hover:text-[#535bf2] text-left'
            onClick={() => setCode(example.code)}
          >
            <div className='italic'>
              {example.description}
            </div>
            <div className='ml-4 font-mono'>
              {example.code}
            </div>
          </button>
        )}
        <div className='h-4'/>
        <h2 className='text-xl font-bold'>code</h2>
        <textarea className='p-4 font-mono'
          value={code} onChange={e => {
            setCode(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = (e.target.scrollHeight + 5) + 'px';
          }}
        />
        <div className='h-4'/>
        <div className={clsx("min-h-0 overflow-hidden flex flex-col", lastGoodProcessed !== processed && "opacity-50")}>
          <h2 className='text-xl font-bold'>result</h2>
          { lastGoodProcessed === null
          ? <p>processing...</p>
          : <div className='overflow-y-scroll'>
              <RelationView relation={lastGoodProcessed.output} />
            </div>
          }
        </div>
        { processed !== null && processed.ok === false &&
          <pre className="bg-red-950 whitespace-pre-wrap">
            { processed.error instanceof SyntaxError
            ? processed.error.format([{source: code, text: code}]).replace(/^ *--> .*\n/m, '')
            : (processed.error as Error).message
            }
          </pre>
        }
      </div>
      <div className={clsx('flex flex-col w-1/2', lastGoodProcessed !== processed && "opacity-20")}>
        <h2 className='text-xl font-bold'>code ast</h2>
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
        <div className='h-4'/>
        <h2 className='text-xl font-bold'>generated Datalog</h2>
        { lastGoodProcessed === null
        ? <p>processing...</p>
        : <div style={{overflow: 'auto'}}>
            <DatalogView program={programToString(lastGoodProcessed.translated.program)} />
          </div>
        }
      </div>

    </div>
  </div>;
});

// const headingByType = {
//   'number': '#',
//   'symbol': 'x',
// };

const DatalogView = memo(({ program }: { program: string }) => {
  // TODO: put stuff on right of :- all on right?
  // TODO: color variables per line?
  const lines = program.split('\n');
  return <div>
    {lines.map((line, i) => {
      return <pre key={i} className={clsx("whitespace-pre-wrap -indent-8 pl-8", (line.startsWith("//") || line.startsWith(".")) && "opacity-50")}>
        {line || ' '}
      </pre>
    })}
  </div>;
});

const RelationView = memo(({ relation }: { relation: Relation }) => {
  if (relation.types.length === 0) {
    if (relation.tuples.length === 0) {
      return <div>FALSE</div>;
    } else {
      return <div>TRUE</div>;
    }
  }
  const MAX_TUPLES = 20;
  const tuplesToShow = relation.tuples.slice(0, MAX_TUPLES);
  const numTuplesHidden = relation.tuples.length - tuplesToShow.length;
  return <div className='w-fit'>
    <table style={{borderCollapse: 'collapse'}}>
      <tbody>
        {tuplesToShow.map((row, i) =>
          <tr key={i}>
            {row.map((value, j) =>
              <td key={j} className='px-1 align-top'
                style={{borderBottom: '1px solid hsl(0, 0%, 20%)', ...j > 0 && {borderLeft: '1px solid hsl(0, 0%, 50%)'}}}>
                {"" + value}
              </td>
            )}
          </tr>
        )}
      </tbody>
    </table>
    {numTuplesHidden > 0 &&
      <div>
        + {numTuplesHidden}
      </div>
    }
  </div>;
});
