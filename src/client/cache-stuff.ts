// TODO: adapted from engraft/shared

export type OrError<T> = {value: T} | {error: unknown};

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const OrError = {
  try<T>(f: () => T): OrError<T> {
    try {
      return {value: f()};
    } catch (e) {
      return {error: e};
    }
  },
  orThrow<T>(f: OrError<T>): T {
    if ('error' in f) {
      throw f.error;
    } else {
      return f.value;
    }
  },
};

const objectToId = new Map<any, number>();
let nextId = 1;
function getId(obj: any): number {
  if (!objectToId.has(obj)) {
    objectToId.set(obj, nextId++);
  }
  return objectToId.get(obj)!;
}

export function cache<F extends (...args: any[]) => any>(f: F): F {
  const _cache: Map<string, OrError<ReturnType<F>>> = new Map();
  return ((...args: Parameters<F>) => {
    const cacheKey = args.map(getId).join(',');
    let cached = _cache.get(cacheKey);
    if (!cached) {
      cached = OrError.try(() => f(...args));
      _cache.set(cacheKey, cached);
    }
    return OrError.orThrow(cached) satisfies ReturnType<F>;
  }) as F;
}
