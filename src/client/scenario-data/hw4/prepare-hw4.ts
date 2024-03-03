import { tsvParseRows } from 'd3-dsv';
import stringify from 'json-stringify-pretty-compact';
import fsP from 'node:fs/promises';
import { inferTypes } from "../../../souffle-run.js";


async function main() {
  const files = (await fsP.readdir(new URL(".", import.meta.url)))
    .filter(f => f.endsWith(".facts"));

  for (const file of files) {
    const text = await fsP.readFile(new URL(file, import.meta.url), "utf-8");
    const tuples = tsvParseRows(text);
    const relation = inferTypes(tuples);
    const relationName = file.slice(0, -6);
    await fsP.writeFile(new URL(`${relationName}.json`, import.meta.url), stringify(relation));
  }
};

main();
