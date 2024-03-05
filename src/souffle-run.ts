import { WorkerPool } from './function-workers.js';
import loadSouffleModule from './souffle-emscripten/souffle.js';
import souffleWasmStr from './souffle-emscripten/souffle.wasm.js';
import { type Type } from './souffle-types.js';


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
    types: tuples[0].map(value =>
      typeof value === 'number'
      ? 'number'  // TODO: add support for floats
      : 'symbol'),
    tuples,
  };
}

export function emptyRelation(types: Type[]): Relation {
  return { types, tuples: [] };
}

export function emptyLike(relation: Relation): Relation {
  return emptyRelation(relation.types);
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
  // special case: no columns, one row
  if (data.types.length === 0 && data.tuples.length === 1) {
    return '()\n';
  }
  return data.tuples.map(row => row.join('\t')).join('\n');
}

export async function runSouffle(
  code: string,
  inputRelations: Record<string, Relation | any[][]>
): Promise<Record<string, Relation>> {
  // console.log(code);

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
  let exitCode = 0;
  try {
    // TODO: @types is out of date; see https://github.com/emscripten-core/emscripten/pull/14865
    exitCode = module.callMain(['--no-preprocessor', 'myfile.dl']) as any as number;
  } catch (e) {
    throw e;
  }
  // console.log("calling main took", Date.now() - now);

  if (exitCode !== 0) {
    console.error("Souffle error:")
    console.error(errorLines.map((line) => `  ${line}`).join('\n'));
    console.error("Running code:");
    console.error(code.split('\n').map((line, i) => `${String(i + 1).padStart(3)}: ${line}`).join('\n'));
    throw new Error(`Souffle error: ${errorLines.join('\n')}`);
  }

  const filenames: string[] = module.FS.readdir('.');
  let outputRelations: Record<string, Relation> = {};
  filenames.forEach((filename: string) => {
    // these end with csv but they're actually tsv
    if (filename.endsWith('.csv')) {
      const relationName = filename.slice(0, -4);
      const contents = module.FS.readFile(filename, { encoding: 'utf8' });
      console.log(filename, JSON.stringify(contents));
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

let _souffleWorkerPool: WorkerPool<typeof runSouffle> | null = null;
function getSouffleWorkerPool() {
  if (!_souffleWorkerPool) {
    _souffleWorkerPool = new WorkerPool(new URL('souffle-run-worker.js', import.meta.url), 5);
  }
  return _souffleWorkerPool;
}

export async function runSouffleInWorker(
  code: string,
  inputRelations: Record<string, Relation | any[][]>
): Promise<Record<string, Relation>> {
  return await getSouffleWorkerPool().call(code, inputRelations);
}
