import { normalizeIndent } from "@engraft/shared/lib/normalizeIndent.js"
import { Relation } from "../souffle-run.js";
import { mkJsObjDB } from "./js.js";
import moviesInputs from "./scenario-data/movies.json";
import wikipedia from './scenario-data/wikipedia.json';
import { hw4Inputs } from './scenario-data/hw4/hw4Inputs.js';

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
      a1: actors | a2: actors |
      a2 > a1,
      let hasBothActors = hasActor.a1 & hasActor.a2 |
      #hasBothActors >= 4,
      #hasBothActors, concat hasBothActors
    `,
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
    code: "x : isPerson | some (x.hasChild - isHappy)",
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
  inspectableValues: wikipediaObjDB.idToObj,
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

export const scenarios: Scenario[] = [
  movies,
  simpleFamily,
  wikipediaJs,
  hw4,
];
