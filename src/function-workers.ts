// It would be cleanest to just run a worker for each function invocation,
// right? But there seem to start-up issues; each time you make a new worker, it
// has to reload a lot of resources (like WASM & such). So instead, we keep a
// worker pool.

// TODO: Terminate workers doing stuff we don't care about anymore.

type SomeFunction = (...args: any[]) => any;

type WorkerWithStatus = {
  worker: Worker,
  isBusy: boolean,
};

export class WorkerPool<F extends SomeFunction> {
  private workersWithStatus: WorkerWithStatus[] = [];

  constructor(
    private workerScriptURL: string | URL,
    private workerCount: number,
  ) {
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(workerScriptURL, { type: 'module' });
      this.workersWithStatus.push({ worker, isBusy: false });
    }
  }

  async call(
    ...args: Parameters<F>
  ): Promise<ReturnType<F>> {
    const workerWithStatus = await this.getFreeWorker();
    workerWithStatus.isBusy = true;
    try {
      return await callInWorker(workerWithStatus.worker, ...args);
    } finally {
      workerWithStatus.isBusy = false;
    }
  }

  private async getFreeWorker(): Promise<WorkerWithStatus> {
    while (true) {
      const workerWithStatus = this.workersWithStatus.find((w) => !w.isBusy);
      if (workerWithStatus) { return workerWithStatus; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

export function callInWorker<F extends SomeFunction>(
  worker: Worker,
  ...args: Parameters<F>
): Promise<ReturnType<F>> {
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const listener = (event: MessageEvent<ResponseData<F>>) => {
      if (event.data.id !== id) { return; }
      worker.removeEventListener('message', listener);
      if ('error' in event.data) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data.result);
      }
    }
    worker.addEventListener('message', listener);
    worker.postMessage({ id, args } satisfies RequestData<F>);
  });
}




type RequestData<F extends SomeFunction> =
  { id: string, args: Parameters<F> };
type ResponseData<F extends SomeFunction> =
  | { id: string, result: ReturnType<F> }
  | { id: string, error: string };

// and here's the part that's run from the worker itself

export function beWorkerForFunction<F extends SomeFunction>(
  func: F
): void {
  // eslint-disable-next-line no-restricted-globals
  const worker = self as unknown as Worker;

  worker.onmessage = async (event: MessageEvent<RequestData<F>>) => {
    const { id, args } = event.data;
    try {
      const result = await func(...args);
      worker.postMessage({
        id,
        result,
      } satisfies ResponseData<F>);
    } catch (error) {
      worker.postMessage({
        id,
        error: error instanceof Error ? error.message : '[unknown error]',
      } satisfies ResponseData<F>);
    }
  }
}
