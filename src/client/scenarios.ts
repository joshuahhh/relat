import { Relation } from "../souffle-run.js";

export type Scenario = {
  name: string,
  inputs: Record<string, Relation>,
  examples: {
    description: string,
    code: string,
  }[],
}

export const movies: Scenario = {
  name: "Movies",
  inputs: {},
  examples: [{
    description: "all movies",
    code: "movie"
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

export const scenarios: Scenario[] = [
  movies,
  simpleFamily,
];
