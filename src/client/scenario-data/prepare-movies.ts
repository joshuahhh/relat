import { DSVRowArray, autoType, csvParse } from 'd3-dsv';
import fsP from 'node:fs/promises';
import { inferTypes } from "../../souffle-run.js";
import stringify from 'json-stringify-pretty-compact';


async function main() {
  const resp = await fetch("https://raw.githubusercontent.com/LearnDataSci/articles/master/Python%20Pandas%20Tutorial%20A%20Complete%20Introduction%20for%20Beginners/IMDB-Movie-Data.csv")
  const text = await resp.text();
  const table = csvParse(text, autoType) as DSVRowArray<string>;  // there are #s but w/e

  function titleAnd(field: string) {
    return inferTypes(table.flatMap(r => {
      const value = r[field];
      return value ? [[r.Title, value]] : [];
    }));
  }

  const isTitle = inferTypes(table.map(r => [r.Title]));
  const hasGenre = inferTypes(table.flatMap(r => r.Genre.split(',').map(genre => [r.Title, genre.trim()])));
  const hasActor = inferTypes(table.flatMap(r => r.Actors.split(',').map(actor => [r.Title, actor.trim()])));
  const hasDirector = titleAnd("Director")
  const hasYear = titleAnd("Year")
  const hasRuntimeMin = titleAnd("Runtime (Minutes)")
  const hasRating = titleAnd("Rating")
  const hasRevenueMil = titleAnd("Revenue (Millions)")

  await fsP.writeFile(new URL("movies-inputs.json", import.meta.url), stringify({
    isTitle, hasGenre, hasActor, hasDirector, hasYear, hasRuntimeMin, hasRating, hasRevenueMil
  }));
};

main();
