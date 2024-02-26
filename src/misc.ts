import inspect from 'object-inspect';

export function assertNever(never: never, message?: string): never {
  throw new Error(message || `Reached unreachable code: unexpected value ${inspect(never)}`);
}
