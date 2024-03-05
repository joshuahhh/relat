import { mkNextIndex } from '../relat-to-dl.js';
import { Relation, emptyRelation } from '../souffle-run.js';


export type JsObjDB = {
  inputs: {
    root: Relation,
    any: Relation,
    okv: Relation,
    str: Relation,
    num: Relation,
    special: Relation,
  },
  idToObj: Map<string, any>,
  rootId: string,
}

export function mkJsObjDB(obj: any): JsObjDB {
  let inputs = {
    okv: emptyRelation(["symbol", "symbol", "symbol"]),
    str: emptyRelation(["symbol", "symbol"]),
    num: emptyRelation(["symbol", "number"]),
    special: emptyRelation(["symbol", "symbol"]),
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

    if (obj === null) {
      inputs.special.tuples.push([id, "null"]);
    } else if (obj === undefined) {
      inputs.special.tuples.push([id, "undefined"]);
    } else if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const valueId = scanAndGetId(value);
        inputs.okv.tuples.push([id, key, valueId]);
      }
    } else if (typeof obj === 'string') {
      inputs.str.tuples.push([id, JSON.stringify(obj)]);
    } else if (typeof obj === 'number') {
      inputs.num.tuples.push([id, obj]);
    } else if (typeof obj === 'boolean') {
      inputs.special.tuples.push([id, obj ? "true" : "false"]);
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

  return { inputs: { root, any, ...inputs }, idToObj, rootId };
}
