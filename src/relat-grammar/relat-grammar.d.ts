export declare function parse(input: string, options: any): unknown;

export declare class SyntaxError extends Error {
  expected: unknown;
  found: string;
  location: {
    source: string;
    start: {
      offset: number;
      line: number;
      column: number;
    };
    end: {
      offset: number;
      line: number;
      column: number;
    };
  };
};
