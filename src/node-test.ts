import util from 'node:util';
import { runSouffle } from "./souffle-run.js";

function inspect(value: any) {
  return util.inspect(value, { showHidden: false, depth: null, colors: true })
}

async function test() {
  const result = await runSouffle(`
    .decl isPerson(x : number)
    .decl hasChild(x : number, y : number)
    .decl isHappy(x : number)

    isPerson(10).
    isPerson(11).
    isPerson(12).
    isPerson(13).
    isPerson(20).
    isPerson(21).
    isPerson(22).
    isPerson(23).
    isPerson(30).

    hasChild(10,11).
    hasChild(10,12).
    hasChild(10,13).
    hasChild(20,21).
    hasChild(20,22).
    hasChild(20,23).
    isHappy(11).
    isHappy(12).
    isHappy(13).
    isHappy(21).
    isHappy(22).

    .decl hasSadChild(x : number)
    hasSadChild(x) :- hasChild(x, y), !isHappy(y).

    .decl hasOnlyHappyChildren(x : number)
    hasOnlyHappyChildren(x) :- ! hasSadChild(x), isPerson(x).

    .output hasOnlyHappyChildren
  `, {});
  console.log(result.hasOnlyHappyChildren.tuples.length);
}

async function main() {
  for (let i = 0; i < 30; i++) {
    await test();
  }
};

main();
