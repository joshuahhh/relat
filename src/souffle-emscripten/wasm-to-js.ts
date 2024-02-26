import fsP from 'node:fs/promises';
import path from 'node:path';


main();

async function main() {
  const wasm = await fsP.readFile(path.resolve(import.meta.dirname, 'souffle.wasm'));
  const base64 = wasm.toString('base64');
  const js = `export default "${base64}";\n`;
  await fsP.writeFile(path.resolve(import.meta.dirname, 'souffle.wasm.js'), js);
};

