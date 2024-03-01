import { mkNextIndex } from '../relat-to-dl.js';
import { Relation } from '../souffle-run.js';


export type JsObjDB = {
  inputs: {
    root: Relation,
    any: Relation,
    okv: Relation,
    string: Relation,
    number: Relation,
  },
  idToObj: Map<string, any>,
  rootId: string,
}

export function mkJsObjDB(obj: any): JsObjDB {
  let okv: Relation = {
    types: ["symbol", "symbol", "symbol"],
    tuples: [],
  }
  let string: Relation = {
    types: ["symbol", "symbol"],
    tuples: [],
  };
  let number: Relation = {
    types: ["symbol", "number"],
    tuples: [],
  };

  const nextIndex = mkNextIndex();
  let idToObj = new Map<string, any>();
  let objToId = new Map<any, string>();

  function scanAndGetId(obj: any): string {
    const maybeId = objToId.get(obj);
    if (maybeId !== undefined) {
      return maybeId;
    }

    const id = "#" + nextIndex();
    objToId.set(obj, id);
    idToObj.set(id, obj);

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const valueId = scanAndGetId(value);
        okv.tuples.push([id, key, valueId]);
      }
    } else if (typeof obj === 'string') {
      string.tuples.push([id, obj]);
    } else if (typeof obj === 'number') {
      number.tuples.push([id, obj]);
    } else {
      throw new Error(`unexpected type ${typeof obj}`);
    }

    return id;
  }

  const rootId = scanAndGetId(obj);

  const root: Relation = {
    types: ["symbol"],
    tuples: [[rootId]],
  };

  const any: Relation = {
    types: ["symbol"],
    tuples: [...objToId.values()].map(obj => [obj]),
  };

  return { inputs: {root, any, okv, string, number}, idToObj, rootId };
}
