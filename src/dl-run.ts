import { Type } from './dl.js';
import loadSouffleModule from './souffle.js';

export type Relation = {
  types: Type[],
  tuples: unknown[][],
}

let loadedModule: any = undefined;

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


export async function souffleModule() {
  if (loadedModule === undefined) {
    loadedModule = await loadSouffleModule({ noInitialRun: true });
  }
  return loadedModule;
}

// This runs a Datalog program verbatim.
export async function runSouffle(
  code: string,
  inputRelations: Record<string, Relation | any[][]>,
  optionsIn?: {
    souffleWasmPath: string,
  }
): Promise<Record<string, Relation>> {
  const options = Object.assign({souffleWasmPath: 'souffle.wasm'}, optionsIn ?? {});

  const errorLines: string[] = [];

  // TODO: loading the module on every run is ridiculous, but it's the only way I know right now
  const module: any = {
    wasmMemory: new WebAssembly.Memory({ initial: 256, maximum: 1024 }),
    // 'print': function(text) {
    //   document.getElementById("stdout").innerText += "\n" + text; console.log(text)  },
    // 'printErr': function(text) {document.getElementById("stderr").innerText += "\n" + text; console.error(text) },
    // "noInitialRun": false,
    // "noExitRuntime": false,
    arguments: ["--no-preprocessor", "myfile.dl"],
    preRun: () => {
      module.FS.writeFile("myfile.dl", code);
      Object.entries(inputRelations).forEach(([name, relationOrTuples]) => {
        module.FS.writeFile(`${name}.facts`, stringifyRelation(inferTypes(relationOrTuples)));
      });
    },
    locateFile: (path: string) => {
      if (path === 'souffle.wasm') {
        return options.souffleWasmPath;
      } else {
        throw new Error(`Unexpected path requested: ${path}`);
      }
    },
    printErr: (line: string) => {
      errorLines.push(line);
    },
  }

  await loadSouffleModule(module);

  if (errorLines.length > 0) {
    console.warn(code);
    throw new Error(`Souffle error: ${errorLines.join('\n')}`);
  }

  Object.entries(inputRelations).forEach(([name]) => {
    module.FS.unlink(`${name}.facts`);
  });

  const filenames: string[] = module.FS.readdir('.');
  let outputRelations: Record<string, Relation> = {};
  filenames.forEach((filename: string) => {
    // these end with csv but they're actually tsv
    if (filename.endsWith('.csv')) {
      const relationName = filename.slice(0, -4);
      outputRelations[relationName] =
        parseRelation(
          module.FS.readFile(filename, { encoding: 'utf8' })
        );
    }
  });

  return outputRelations;
}
