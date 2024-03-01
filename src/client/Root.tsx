import _ from 'lodash';
import { ReactNode, memo, useEffect, useMemo, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './shadcn/Tooltip.js';

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
    // console.log(programString);

    const output = await runRelat(code, inputs);

    return { ok: true as const, ast, translated, programString, output };
  } catch (e) {
    return { ok: false as const, error: e };
  }
}

export const Root = memo(() => {
  const [ scenario, setScenario ] = useState<Scenario>(scenarios[0]);
  const [ code, setCode ] = useState(scenario.examples[0].code);

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
      <div className='flex flex-col justify-end mb-6'>
        <h1 className='text-5xl'>relat</h1>
        <div className='h-2'/>
        {scenarios.map((s, i) =>
          <button key={i}
            className={clsx(
              'block text-[#646cff] hover:text-[#535bf2] text-left whitespace-nowrap',
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
      <div className='flex flex-row overflow-x-scroll'>
        {entries(scenario.inputs).map(([name, relation]) => <>
          <div key={name} className="flex flex-col items-start w-fit">
            <h3 className='text-lg font-bold'>{name}</h3>
            <div className='overflow-y-scroll w-fit'>
              <RelationView relation={relation} inspectableValues={scenario.inspectableValues} />
            </div>
          </div>
          <div className='bg-gray-500 min-w-px h-full mx-2'/>
        </>)}
      </div>
    </div>
    <hr className='min-h-px my-4 bg-gray-500 border-0'/>
    <div className='flex flex-row min-h-0 gap-8'>
      <div className='flex flex-col w-1/2'>
        <h2 className='text-xl font-bold'>try out...</h2>
        <div className='overflow-auto'>
          {scenario.examples.map((example, i) =>
            <button key={i} className='block text-[#646cff] hover:text-[#535bf2] text-left'
              onClick={() => setCode(example.code)}
            >
              <div className='italic'>
                {example.description}
              </div>
              <div className='ml-4 font-mono whitespace-pre'>
                {example.code}
              </div>
            </button>
          )}
        </div>
        <div className='h-4'/>
        <h2 className='text-xl font-bold'>code</h2>
        <textarea className='p-4 font-mono bg-gray-800 whitespace-pre'
          spellCheck={false}
          value={code} onChange={e => {
            setCode(e.target.value);
            e.target.style.minHeight = 'auto';
            e.target.style.minHeight = (e.target.scrollHeight + 5) + 'px';
          }}
          onKeyDown={(e) => {
            const textarea = e.currentTarget;
            if (e.key === 'Tab') {
              e.preventDefault();

              var start = textarea.selectionStart;
              var end = textarea.selectionEnd;

              // set textarea value to: text before caret + tab + text after caret
              textarea.value = textarea.value.substring(0, start) +
                "\t" + textarea.value.substring(end);

              // put caret at right position again
              textarea.selectionStart =
                e.currentTarget.selectionEnd = start + 1;
            }
          }}
        />
        <div className='h-4'/>
        <div className={clsx("min-h-0 overflow-hidden flex flex-col", lastGoodProcessed !== processed && "opacity-50")}>
          <h2 className='text-xl font-bold'>result</h2>
          { lastGoodProcessed === null
          ? <p>processing...</p>
          : <div className='overflow-y-scroll'>
              <RelationView relation={lastGoodProcessed.output} inspectableValues={scenario.inspectableValues} />
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
        : <details className='flex flex-col'>
            <summary className='flex whitespace-pre-wrap font-mono'>
              {toSexpr(lastGoodProcessed.ast)}
            </summary>
            <pre className='overflow-auto min-h-0'>
              {JSON.stringify(stripMeta(lastGoodProcessed.ast), null, 2)}
            </pre>
          </details>
        }
        <div className='h-4'/>
        <h2 className='text-xl font-bold'>generated Datalog</h2>
        { lastGoodProcessed === null
        ? <p>processing...</p>
        : <div className="overflow-auto">
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
      const isRule = line.includes(' :- ');
      if (isRule) {
        return <DatalogRuleView key={i} ruleLine={line} />;
      } else {
        return <pre key={i} className="whitespace-pre-wrap -indent-8 pl-8 opacity-50">
          {line || ' '}
        </pre>
      }
    })}
  </div>;
});

const DatalogRuleView = memo((props: { ruleLine: string }) => {
  const { ruleLine } = props;
  const pairs = useMemo(() => {
    // const [head, _body] = ruleLine.split(' :- ');
    const relationBodies = ruleLine.matchAll(/(?<=[a-zA-Z0-9_])\(([^)]+)\)/g);
    const vars = _.difference(_.uniq(_.flatMap([...relationBodies], ([, body]) => body.split(', '))), ['_']);
    // const vars = [];
    const colors = ['text-sky-400', 'text-orange-300', 'text-lime-300', 'text-rose-300']
    return vars.map((v, i) => ({
      substr: `(?<![a-zA-Z0-9_])${v}(?![a-zA-Z0-9_])`, className: 'inline ' + colors[i % colors.length]
    }));
  }, [ruleLine])

  return <pre className="whitespace-pre-wrap -indent-8 pl-8">
    <HighlightSubstrings str={ruleLine} pairs={pairs} />
  </pre>;
});

interface SubstrClassPair {
  substr: string;
  className: string;
}

interface HighlightSubstringsProps {
  str: string;
  pairs: SubstrClassPair[];
}

const HighlightSubstrings: React.FC<HighlightSubstringsProps> = ({ str, pairs }) => {
  let elements: JSX.Element[] = [];
  let occurrences: { index: number; length: number; className: string }[] = [];

  // Find all occurrences of substrings and store them with their class names
  pairs.forEach(pair => {
    const regex = new RegExp(pair.substr, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      occurrences.push({ index: match.index, length: match[0].length, className: pair.className });
    }
  });

  // Sort occurrences by their starting index
  occurrences.sort((a, b) => a.index - b.index);

  let lastIndex = 0; // Track the index of the last processed character

  // Process each occurrence
  occurrences.forEach(occurrence => {
    // Add unprocessed text before the current occurrence
    if (occurrence.index > lastIndex) {
      elements.push(<span key={`text-${lastIndex}`}>{str.substring(lastIndex, occurrence.index)}</span>);
    }

    // Add the highlighted substring
    elements.push(
      <div className={occurrence.className} key={`highlight-${occurrence.index}`}>
        {str.substring(occurrence.index, occurrence.index + occurrence.length)}
      </div>
    );

    // Update the lastIndex to the end of the current occurrence
    lastIndex = occurrence.index + occurrence.length;
  });

  // Add any remaining text after the last occurrence
  if (lastIndex < str.length) {
    elements.push(<span key={`text-${lastIndex}`}>{str.substring(lastIndex)}</span>);
  }

  return <>{elements}</>;
};


const RelationView = memo((props: {
  relation: Relation,
  inspectableValues?: Map<any, any>,
}) => {
  const { relation, inspectableValues = new Map() } = props;
  if (relation.types.length === 0) {
    if (relation.tuples.length === 0) {
      return <div>false ({"{}"})</div>;
    } else {
      return <div>true ({"{()}"})</div>;
    }
  }

  if (relation.tuples.length === 0) {
    return <div>empty relation with signature ({relation.types.join(", ")})</div>;
  }

  const MAX_TUPLES = 20;
  const tuplesToShow = relation.tuples.slice(0, MAX_TUPLES);
  const numTuplesHidden = relation.tuples.length - tuplesToShow.length;
  return <div className='w-fit'>
    <table style={{borderCollapse: 'collapse'}}>
      <tbody>
        {tuplesToShow.map((row, i) =>
          <tr key={i}>
            {row.map((value, j) => {
              let content: ReactNode = String(value);
              const maybeInspectableValue = inspectableValues.get(value);
              if (maybeInspectableValue !== undefined) {
                content = <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className='underline decoration-dotted'>{content}</TooltipTrigger>
                    <TooltipContent>
                      <pre className='text-xs max-w-xl max-h-96 overflow-auto'>
                        {JSON.stringify(inspectableValues.get(value), null, 2)}
                      </pre>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>;
              }
              return <td key={j} className='px-1 align-top whitespace-nowrap overflow-ellipsis overflow-hidden max-w-xl'
                style={{borderBottom: '1px solid hsl(0, 0%, 20%)', ...j > 0 && {borderLeft: '1px solid hsl(0, 0%, 50%)'}}}
              >
                {content}
              </td>
            })}
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
