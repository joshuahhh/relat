import { type Type } from './souffle-types.js';
import loadSouffleModule from './souffle-emscripten/souffle.js';
import souffleWasmStr from './souffle-emscripten/souffle.wasm.js';


// This is my packaged driver for running Souffle, using the Emscripten-packaged
// module in the `souffle-emscripten` directory. The driver just takes raw code
// and input relations and returns output relations.

const wasmBinary = Uint8Array.from(atob(souffleWasmStr), c => c.charCodeAt(0));

export type Relation = {
  types: Type[],
  tuples: unknown[][],
}

// TODO: parsing & type inference could be a lot better
// * combine into single process
// * consider all values in column
// * general framework to support more types

export function inferTypes(tuples: Relation | unknown[][]): Relation {
  if (!Array.isArray(tuples)) {
    return tuples;
  }
  if (tuples.length === 0) {
    throw new Error(`Cannot infer types of empty relation`);
  }
  return {
    types: tuples[0].map(value => typeof value === 'number' ? 'number' : 'symbol'),
    tuples,
  };
}

function parseIntOr(s: string) {
  const parsed = parseInt(s);
  return isNaN(parsed) ? s : parsed;
}

function parseRelation(data: string, types?: Type[]): Relation {
const tuples = data.trim().split('\n').map(line => line.split('\t').map(s => parseIntOr(s)));
  if (types) {
    return { types, tuples };
  } else {
    return inferTypes(tuples);
  }
}

function stringifyRelation(data: Relation): string {
  return data.tuples.map(row => row.join('\t')).join('\n');
}

export async function runSouffle(
  code: string,
  inputRelations: Record<string, Relation | any[][]>
): Promise<Record<string, Relation>> {
  // let now = Date.now();
  const errorLines: string[] = [];
  const module = await loadSouffleModule({
    // wasmMemory,
    wasmBinary,
    noInitialRun: true,
    printErr: (line) => {
      errorLines.push(line);
    }
  });
  // console.log("loading took", Date.now() - now);

  module.FS.writeFile("myfile.dl", code);
  Object.entries(inputRelations).forEach(([name, relationOrTuples]) => {
    module.FS.writeFile(`${name}.facts`, stringifyRelation(inferTypes(relationOrTuples)));
  });

  // now = Date.now();
  try {
    module.callMain(['--no-preprocessor', 'myfile.dl']);
  } catch (e) {
    console.error("Error calling main", e);
    throw e;
  }
  // console.log("calling main took", Date.now() - now);

  if (errorLines.length > 0) {
    throw new Error(`Souffle error: ${errorLines.join('\n')}`);
  }

  const filenames: string[] = module.FS.readdir('.');
  let outputRelations: Record<string, Relation> = {};
  filenames.forEach((filename: string) => {
    // these end with csv but they're actually tsv
    if (filename.endsWith('.csv')) {
      const relationName = filename.slice(0, -4);
      const contents = module.FS.readFile(filename, { encoding: 'utf8' });
      if (contents.trim() === '') {
        // special case: no columns, no rows
        outputRelations[relationName] = { types: [], tuples: [] };
      } else if (contents.trim() === '()') {
        // special case: no columns, one row
        outputRelations[relationName] = { types: [], tuples: [[]] };
      } else {
        outputRelations[relationName] = parseRelation(contents);
      }
    }
  });
  return outputRelations;
}
