import { normalizeIndent } from "@engraft/shared/lib/normalizeIndent.js"
import { Relation } from "../souffle-run.js";
import { mkJsObjDB } from "./js.js";
import moviesInputs from "./movies-inputs.json";
import wikipedia from './wikipedia.json';

export type Scenario = {
  name: string,
  inputs: Record<string, Relation>,
  examples: {
    description: string,
    code: string,
  }[],
  inspectableValues?: Map<any, any>,
}

export const movies: Scenario = {
  name: "Movies",
  inputs: moviesInputs as any,
  examples: [{
    description: "how many movies of each genre?",
    code: "{genre: hasGenre[_] | #hasGenre.genre}",
  }, {
    description: "which directors act in their movies?",
    code: "{x: isTitle | x.hasActor & x.hasDirector}",
  }, {
    description: "how many actors?",
    code: "#hasActor[_]",
  }, {
    description: "how many actors are connected with Vin Diesel?",
    code: "#'Vin Diesel'.^(~hasActor.hasActor)",
  }, {
    description: "shortest runtime by genre?",
    code: "{genre: hasGenre[_] | min ~hasGenre[genre].hasRuntimeMin}",
  // }, {
  //   description: "which pairs act together a lot?",
  //   code: "let actors = isTitle.hasActor | #{a1: actors | {a2: actors | a1, a2}}",
  }],
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
    code: "isPerson - isHappy",
  }, {
    description: "who has an unhappy child?",
    code: "{x : isPerson | some (x.hasChild - isHappy)}",
  }, {
    description: "how many children does each person have?",
    code: "{x : isPerson | #x.hasChild}",
  }, {
    description: "how many children does each parent have?",
    code: "{x : isPerson | let cnt = #x.hasChild | cnt > 0, cnt}",
  }],
};

const wikipediaObjDB = mkJsObjDB(wikipedia);

export const wikipediaJs: Scenario = {
  name: "Wikipedia response",
  inputs: wikipediaObjDB.inputs,
  examples: [{
    description: "root keys & values?",
    code: "root.okv",
  }, {
    description: "titles and extracts of pages?",
    code: normalizeIndent`
      { page: root.okv["query"].okv["pages"].okv[_] |
        "title", page.okv["title"].str;
        "extract", page.okv["extract"].str }
    `,
  }],
  inspectableValues: wikipediaObjDB.idToObj,
};

export const scenarios: Scenario[] = [
  movies,
  simpleFamily,
  wikipediaJs,
];
