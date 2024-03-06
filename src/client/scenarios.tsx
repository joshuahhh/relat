import { normalizeIndent } from "@engraft/shared/lib/normalizeIndent.js";
import { Node, parse } from 'acorn';
import { ReactNode } from "react";
import { Relation } from "../souffle-run.js";
import { mkJsObjDB } from "./js.js";
import { hw4Inputs } from './scenario-data/hw4/hw4Inputs.js';
import moviesInputs from "./scenario-data/movies.json";
import wikipedia from './scenario-data/wikipedia.json';

export type Scenario = {
  name: string,
  inputs: Record<string, Relation>,
  examples: {
    description: string,
    code: string,
  }[],
  info?: ReactNode,
  valueInspectors?: Map<any, ReactNode>,
}

export const movies: Scenario = {
  name: "Movies",
  inputs: moviesInputs as any,
  examples: [{
    description: "how many movies of each genre?",
    code: "genre: hasGenre[_] | #hasGenre.genre",
  }, {
    description: "which directors act in their movies?",
    code: "x: isTitle | x.hasActor & x.hasDirector",
  }, {
    description: "how many actors?",
    code: "#hasActor[_]",
  }, {
    description: "how many actors are connected with Vin Diesel?",
    code: "#'Vin Diesel'.^(~hasActor.hasActor)",
  }, {
    description: "shortest runtime by genre?",
    code: "genre: hasGenre[_] | min ~hasGenre[genre].hasRuntimeMin",
  }, {
    description: "which pairs act together a lot?",
    code: normalizeIndent`
      let actors = isTitle.hasActor |
      a1: actors | a2: actors | a2 > a1,
      let hasBothActors = hasActor.a1 & hasActor.a2 |
      #hasBothActors >= 3,
      #hasBothActors, concat hasBothActors
    `,
  }],
  info: <p>
    A data set of 1,000 popular movies on IMDB from 2006 to 2016,
    available from <a className="text-[#646cff] hover:text-[#535bf2]" href="https://www.kaggle.com/datasets/PromptCloudHQ/imdb-data">Kaggle</a>.
  </p>
};

export const simpleFamily: Scenario = {
  name: "Simple family",
  inputs: {
    isPerson: { types: ["number"], tuples: [
      [10], [11], [12], [13], [20], [21], [22], [23], [30]
    ] },
    hasChild: { types: ["number", "number"], tuples: [
      [10, 11],
      [10, 12],
      [10, 13],
      [20, 21],
      [20, 22],
      [20, 23]
    ] },
    isHappy: { types: ["number"], tuples: [
      [11], [12], [13], [21], [22]
    ] },
  },
  examples: [{
    description: "who is unhappy?",
    code: String.raw`isPerson \ isHappy`,
  }, {
    description: "who has an unhappy child?",
    code: String.raw`x : isPerson | some (x.hasChild \ isHappy)`,
  }, {
    description: "how many children does each person have?",
    code: "x : isPerson | #x.hasChild",
  }, {
    description: "how many children does each parent have?",
    code: "x : isPerson | let cnt = #x.hasChild | cnt > 0, cnt",
  }],
};

const wikipediaObjDB = mkJsObjDB(wikipedia);

export const wikipediaJs: Scenario = {
  name: "Wikipedia response",
  inputs: wikipediaObjDB.inputs,
  examples: [{
    description: "root keys & values",
    code: "root.okv",
  }, {
    description: "titles and extracts of pages",
    code: normalizeIndent`
      page: root.okv["query"].okv["pages"].okv[_] |
        "title", page.okv["title"].str;
        "extract", page.okv["extract"].str
    `,
  }, {
    description: "titles and extracts of pages (w/sugar)",
    code: normalizeIndent`
      page: root.<query>.<pages>.<_> |
        "title", page.<title>.str;
        "extract", page.<extract>.str
    `,
  }],
  info: <p>
    A JSON response from the Wikipedia API consisting of five random pages.
  </p>,
  valueInspectors: mapValues(wikipediaObjDB.idToObj, (obj) =>
    <pre className='text-xs max-w-xl max-h-96 overflow-auto'>
      {JSON.stringify(obj, null, 2)}
    </pre>
  ),
};

export const hw4: Scenario = {
  name: "HW4",
  inputs: hw4Inputs,
  examples: [{
    description: "1. descendents of Priscilla (etc)",
    code: '"Priscilla".^parent_child <: person',
  }, {
    description: "2. women & men with most children",
    code: normalizeIndent`
      let num_children = (x : person._ | #parent_child[x]) |
      let most_mothered = max num_children[female] |
      let most_fathered = max num_children[male] |
      x, c: num_children & (female, most_mothered ; male, most_fathered) |
      person[x]
    `,
  }],
};

const acornCode = normalizeIndent`
function fib(n) {
  if (n <= 1) { return n };
  return fib(n - 1) + fib(n - 2);
}

function isZero(n) {
  return n === 0;
}

function isEven(n) {
  if (isZero(n)) {
    return true;
  } else {
    return isOdd(n - 1);
  }
}

function isOdd(n) {
  if (isZero(n)) {
    return false;
  } else {
    return isEven(n - 1);
  }
}
`;

const acornObjDB = mkJsObjDB(parse(acornCode, { ecmaVersion: 2020 }).body);

export const acorn: Scenario = {
  name: "JavaScript AST",
  inputs: acornObjDB.inputs,
  examples: [{
    description: "identifiers w/names",
    code: `x : any | x.<type>.str = '"Identifier"', x.<name>.str`,
  }, {
    description: "identifiers w/names (v2)",
    code: `(x : any | x.<type>.str = '"Identifier"') <: <name>.str`,
  }, {
    description: "identifiers w/names (v3)",
    code: `<type>.str.'"Identifier"' <: <name>.str`,
  }, {
    description: "recursive functions",
    code: normalizeIndent`
      let idName = <type>.str.'"Identifier"' <: <name>.str |
      let fnRef = (fnDecl : any ->
        fnDecl.<type>.str = '"FunctionDeclaration"',
        fnDecl.<id>.<name>.str,
        fnDecl.<body>.^<_>.idName
      ) |
      x, y : fnRef -> x = y, x
    `,
  }, {
    description: "recursive functions (including mutually recursive)",
    code: normalizeIndent`
      let idName = <type>.str.'"Identifier"' <: <name>.str |
      let fnRef = (fnDecl : any ->
        fnDecl.<type>.str = '"FunctionDeclaration"',
        fnDecl.<id>.<name>.str,
        fnDecl.<body>.^<_>.idName
      ) |
      x, y : ^fnRef -> x = y, x
    `,
  }],
  info: <>
    We parse the following JavaScript code with Acorn:
    <pre className='text-xs max-w-xl max-h-96 overflow-auto mt-4'>
      {acornCode}
    </pre>
  </>,
  valueInspectors: mapValues(acornObjDB.idToObj, (obj) => {
    let summary: ReactNode;

    function nodeSummary(obj: any) {
      try {
        const node = obj as Node;
        if (node.start !== undefined && node.end !== undefined) {
          return (
            <pre className='text-xs max-w-xl max-h-96 overflow-auto'>
              {acornCode.slice(node.start, node.end)}
            </pre>
          );
        }
      } catch (e) {
        return undefined;
      }
    }

    if (obj instanceof Array) {
      // summary = obj.map(nodeSummary);
    } else {
      summary = nodeSummary(obj);
    }

    return <div>
      {summary && <>
        {summary}
        <hr className='min-h-px my-4 bg-gray-500 border-0'/>
      </>}
      <pre className='text-xs max-w-xl max-h-96 overflow-auto'>
        {JSON.stringify(obj, null, 2)}
      </pre>
    </div>
  }),
};

export const scenarios: Scenario[] = [
  movies,
  simpleFamily,
  wikipediaJs,
  hw4,
  acorn,
];

function mapValues<K, V, V2>(map: Map<K, V>, f: (v: V) => V2): Map<K, V2> {
  const result = new Map<K, V2>();
  for (const [k, v] of map) {
    result.set(k, f(v));
  }
  return result;
}
