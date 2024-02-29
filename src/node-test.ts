import util from 'node:util';
import { inferTypes, runSouffle } from "./souffle-run.js";
import { csvParse } from 'd3-dsv';
import fsP from 'node:fs/promises';

function inspect(value: any) {
  return util.inspect(value, { showHidden: false, depth: null, colors: true })
}

async function main() {
  const resp = await fetch("https://raw.githubusercontent.com/LearnDataSci/articles/master/Python%20Pandas%20Tutorial%20A%20Complete%20Introduction%20for%20Beginners/IMDB-Movie-Data.csv")
  const text = await resp.text();
  const table = csvParse(text);
  const isTitle = inferTypes(table.map(r => [r.Title]));
  const hasGenre = inferTypes(table.flatMap(r => r.Genre.split(',').map(genre => [r.Title, genre])));
  const hasActor = inferTypes(table.flatMap(r => r.Actors.split(', ').map(actor => [r.Title, actor])));
  const hasDirector = inferTypes(table.map(r => [r.Title, r.Director]));
  const hasYear = inferTypes(table.map(r => [r.Title, r.Year]));
  const hasRuntimeMin = inferTypes(table.map(r => [r.Title, r["Runtime (Minutes)"]]));
  const hasRating = inferTypes(table.map(r => [r.Title, r.Rating]));
  const hasRevenueMil = inferTypes(table.map(r => [r.Title, r["Revenue (Millions)"]]));

  await fsP.writeFile("movies.json", JSON.stringify({
    isTitle, hasGenre, hasActor, hasDirector, hasYear, hasRuntimeMin, hasRating, hasRevenueMil
  }));
};

main();
