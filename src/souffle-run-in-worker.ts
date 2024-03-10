import { WorkerPool } from './function-workers.js';
import { Relation, runSouffle } from './souffle-run.js';
import souffleRunWorkerUrl from './souffle-run-worker.js?worker&url';


let _souffleWorkerPool: WorkerPool<typeof runSouffle> | null = null;
function getSouffleWorkerPool() {
  if (!_souffleWorkerPool) {
    _souffleWorkerPool = new WorkerPool(souffleRunWorkerUrl, 5);
  }
  return _souffleWorkerPool;
}

export async function runSouffleInWorker(
  code: string,
  inputRelations: Record<string, Relation | any[][]>
): Promise<Record<string, Relation>> {
  return await getSouffleWorkerPool().call(code, inputRelations);
}
