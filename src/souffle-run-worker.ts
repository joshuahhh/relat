import { beWorkerForFunction } from "./function-workers.js";
import { runSouffle } from "./souffle-run.js";

beWorkerForFunction(runSouffle);

export {}
