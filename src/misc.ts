import inspect from 'object-inspect';

export function assertNever(never: never, message?: string): never {
  throw new Error(message || `Reached unreachable code: unexpected value ${inspect(never)}`);
}

export function entries<K extends string, V>(o: Record<K, V>) {
  return Object.entries(o) as [K, V][];
}

export function fromEntries<K extends string, V>(entries: [K, V][]) {
  return Object.fromEntries(entries) as Record<K, V>;
}
