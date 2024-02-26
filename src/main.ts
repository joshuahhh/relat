import './style.css'
import typescriptLogo from './typescript.svg'
import { setupCounter } from './counter.js'
import * as Peggy from 'peggy';
import * as lib from './lib.js';

(window as any).lib = lib;
(window as any).Peggy = Peggy;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

const hasChild = lib.inferTypes([
  ["Queen Elizabeth II", "Prince Charles"],
  ["Queen Elizabeth II", "Princess Anne"],
  ["Queen Elizabeth II", "Prince Andrew"],
  ["Queen Elizabeth II", "Prince Edward"],
  ["Prince Charles", "Prince William"],
  ["Prince Charles", "Prince Harry"],
  ["Prince William", "Prince George"],
  ["Prince William", "Princess Charlotte"],
  ["Prince William", "Prince Louis"],
  ["Prince Harry", "Archie Harrison Mountbatten-Windsor"],
  ["Prince Harry", "Lilibet Diana Mountbatten-Windsor"]
]);

const isPerson = lib.inferTypes([
  ["Queen Elizabeth II"],
  ["Prince Charles"],
  ["Princess Anne"],
  ["Prince Andrew"],
  ["Prince Edward"],
  ["Prince William"],
  ["Prince Harry"],
  ["Prince George"],
  ["Princess Charlotte"],
  ["Prince Louis"],
  ["Archie Harrison Mountbatten-Windsor"],
  ["Lilibet Diana Mountbatten-Windsor"]
]);

lib.runRelat(
  "{p: isPerson | #p.hasChild}",
  { isPerson, hasChild }
).then((result) => {
  result.tuples.forEach((tuple) => {
    console.log(tuple);
  });
})

console.log()

// console.log(
//   lib.programToString(
//     lib.translationResultToFullProgram(
//       lib.translate(
//         lib.parse("{p: isPerson | p.hasChild}"),
//         {
//           externalSig: [],
//           constraint: [],
//           inputRelSigs,
//           nextIndex: lib.makeNextIndex(),
//         }
//       ),
//       inputRelSigs
//     )
//   )
// )
