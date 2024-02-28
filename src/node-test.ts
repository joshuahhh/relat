import util from 'node:util';
import { runSouffle } from "./souffle-run.js";
import { csvParse } from 'd3-dsv';

function inspect(value: any) {
  return util.inspect(value, { showHidden: false, depth: null, colors: true })
}

async function main() {
  const resp = await fetch("https://raw.githubusercontent.com/LearnDataSci/articles/master/Python%20Pandas%20Tutorial%20A%20Complete%20Introduction%20for%20Beginners/IMDB-Movie-Data.csv")
  const text = await resp.text();
  const parsed = csvParse(text);
  console.log(parsed);
};

main();
