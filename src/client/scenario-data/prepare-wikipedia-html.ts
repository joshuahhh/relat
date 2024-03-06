import { parse, Node, HTMLElement, TextNode } from 'node-html-parser';
import * as fsP from 'node:fs/promises';
// import { inspect } from 'node:util';
import stringify from 'json-stringify-pretty-compact';

type JSONNode = string | {
  tagName: string,
  attrs: Record<string, string>,
  classList: string[],
  childNodes: JSONNode[],
};

function nodeToJSON(node: Node): JSONNode {
  if (node instanceof TextNode) {
    return node.rawText;
  } else if (node instanceof HTMLElement) {
    return {
      tagName: node.tagName,
      attrs: node.attrs,
      classList: node.classList.value,
      childNodes: node.childNodes.map(nodeToJSON),
    };
  } else {
    throw new Error(`Unknown node type: ${node}`);
  }
}

async function main() {
  const html = await fsP.readFile(new URL('wikipedia-html.html', import.meta.url), 'utf8');
  const root = parse(html);
  // console.log(inspect(nodeToJSON(root), { depth: null, colors: true }));
  fsP.writeFile(new URL('wikipedia-html.json', import.meta.url), stringify(nodeToJSON(root)));
}

main();
