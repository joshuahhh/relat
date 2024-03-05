import clsx from 'clsx';
import _ from 'lodash';
import { ReactNode, memo, useEffect, useMemo, useState } from 'react';
import { Program, programToString } from '../dl.js';
import { entries } from '../misc.js';
import { SyntaxError } from '../relat-grammar/relat-grammar.js';
import { parseRelat } from '../relat-parse.js';
import { Environment, SRelation, ScopeRelationsOnly, mkNextIndex, mkRelatVarUnsafe, translate, translationResultToFullProgram } from '../relat-to-dl.js';
import { Expression, stripMeta, toSexpr } from '../relat.js';
import { Relation, inferTypes, runSouffle } from '../souffle-run.js';
import { Scenario, scenarios } from './scenarios.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './shadcn/Tooltip.js';
import { Switch } from './shadcn/Switch.js';
import { Label } from './shadcn/Label.js';
import { MdForward, MdRedo } from 'react-icons/md';
import { BsArrowsCollapse, BsArrowsCollapseVertical, BsArrowsExpandVertical } from 'react-icons/bs';

type ProcessResult = {
  steps: {
    ast?: Expression,
    translatedProgram?: Program,
    output?: Relation,
  },
  error?: Error,
};

async function process(code: string, inputs: Record<string, Relation>, executionEnabled: boolean) {
  let toReturn: ProcessResult = {
    steps: {}
  };

  try {
    // TODO: this is kinda a copy-paste replica of runRelat which outputs
    // intermediate values; maybe runRelat should provide this as an option?

    const codeDesugared = code
      .replaceAll("<_>", "okv[_]")
      .replaceAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g, 'okv["$1"]');
    const ast = parseRelat(codeDesugared);
    toReturn.steps.ast = ast;
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

    const env: Environment = {
        nextIndex: mkNextIndex(),
        scope,
    };

    const translated = translate(ast, env);
    toReturn.steps.translatedProgram = translated.program;
    const fullProgram = translationResultToFullProgram(translated, scope);
    const programString = programToString(fullProgram);
    // console.log(programString);

    if (!executionEnabled) {
      return toReturn;
    }

    const outputUntyped = await runSouffle(programString, inputs);
    const output = {
      ...outputUntyped[translated.name],
      // We know the actual signature, so substitute that in.
      // (Helps if, say, the result set is empty.)
      types: translated.intSlots.map(slot => slot.type),
    };
    toReturn.steps.output = output;

    return toReturn;
  } catch (e) {
    toReturn.error = e as Error;
    return toReturn;
  }
}

export const Root = memo(() => {
  const [ scenario, setScenario ] = useState<Scenario>(scenarios[0]);
  const [ code, setCode ] = useState(scenario.examples[0].code);
  const [ executionEnabled, setExecutionEnabled ] = useState(true);
  const [ showIntermediates, setShowIntermediates ] = useState(true);

  const [ processed, setProcessed ] = useState<ProcessResult | null>(null);
  const [ lastGoodSteps, setLastGoodSteps ] = useState<ProcessResult["steps"]>({});

  useEffect(() => {
    (async () => {
      setProcessed(null);
      const processed = await process(code, scenario.inputs, executionEnabled);
      setProcessed(processed);
      setLastGoodSteps((oldLastGoodSteps) => {
        return {
          ...oldLastGoodSteps,
          ...processed.steps,
        };
      });
    })();
  }, [code, executionEnabled, scenario.inputs]);

  const [ textArea, setTextArea ] = useState<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void code;
    if (textArea !== null) {
      textArea.style.minHeight = 'auto';
      textArea.style.minHeight = (textArea.scrollHeight + 5) + 'px';
    }
  }, [textArea, code]);

  const arrowToggle = (
    <div className='self-center flex flex-col items-center cursor-pointer group' onClick={() => setShowIntermediates((x) => !x)}>
      <MdForward className='text-4xl'/>
      <div className='invisible group-hover:visible'>
        { showIntermediates ? <BsArrowsCollapseVertical /> : <BsArrowsExpandVertical />}
      </div>
    </div>
  );

  return <div className='main-column flex flex-col p-6 w-full h-full'>
    <div className="top-row flex flex-row gap-10 h-1/3">
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
    <div className='bottom-row flex flex-row min-h-0 gap-8'>
      <div className='flex flex-col flex-1'>
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
        <textarea className={clsx('p-4 font-mono bg-gray-800 whitespace-pre', !processed && 'bg-green-950')}
          spellCheck={false}
          value={code}
          ref={setTextArea}
          onChange={e => {
            setCode(e.target.value);
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
        { processed?.error && <>
          <div className='h-4'/>
          <pre className="bg-red-950 whitespace-pre-wrap">
            { processed.error instanceof SyntaxError
            ? processed.error.format([{source: code, text: code}]).replace(/^ *--> .*\n/m, '')
            : (processed.error as Error).message
            }
          </pre>
        </>}
        <div className='h-4'/>
        <div className="flex items-center space-x-2">
          <Switch checked={executionEnabled} onCheckedChange={setExecutionEnabled} />
          <Label htmlFor="airplane-mode">execution enabled?</Label>
        </div>
      </div>
      { showIntermediates
        ? <>
            {arrowToggle}
            <div className='flex flex-col flex-1'>
              <div className={clsx('flex flex-col', !processed?.steps.ast && "opacity-50")}>
                <h2 className='text-xl font-bold'>code ast</h2>
                { !lastGoodSteps.ast
                ? <p>not ready yet</p>
                : <details className='flex flex-col'>
                    <summary className='flex whitespace-pre-wrap font-mono'>
                      {toSexpr(lastGoodSteps.ast)}
                    </summary>
                    <pre className='overflow-auto min-h-0'>
                      {JSON.stringify(stripMeta(lastGoodSteps.ast), null, 2)}
                    </pre>
                  </details>
                }
              </div>
              <div className='h-4'/>
              <div className={clsx('flex flex-col min-h-0', !processed?.steps.translatedProgram && "opacity-50")}>
                <h2 className='text-xl font-bold'>generated Datalog</h2>
                { !lastGoodSteps.translatedProgram
                ? <p>not ready yet</p>
                : <div className="overflow-auto">
                    <DatalogView program={programToString(lastGoodSteps.translatedProgram)} />
                  </div>
                }
              </div>
            </div>
            {arrowToggle}
          </>
        : arrowToggle
      }
      <div className={clsx("flex flex-col flex-1 min-h-0 overflow-hidden ", !processed?.steps.output && "opacity-50")}>
          <h2 className='text-xl font-bold'>result</h2>
          { !lastGoodSteps.output
          ? <p>processing...</p>
          : <div className='overflow-y-scroll'>
              <RelationView relation={lastGoodSteps.output} inspectableValues={scenario.inspectableValues} />
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
                  <Tooltip delayDuration={0} disableHoverableContent={true}>
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
