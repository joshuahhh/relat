// math -> sum
// sum -> sum ("+"|"-") product | product
// product -> product ("*"|"/") exp | exp
// exp -> number "^" exp | number

/*
const math = grammar({
  name: 'math',
  rules: {
    math: $ => choice(
      $.sum,
      $.product,
      $.exp,
    ),
    sum: $ => choice(
      seq($.sum, '+', $.product),
      seq($.sum, '-', $.product),
      $.product,
    ),
    product: $ => choice(
      seq($.product, '*', $.exp),
      seq($.product, '/', $.exp),
      $.exp,
    ),
    exp: $ => choice(
      seq($.exp, '^', $.exp),
      $.number,
    ),
    number: $ => /\d+/,
  }
});
*/

// math -> sum
// sum -> sum "+" product | product
// product -> product "*" number | number
// number -> 1

type Sym<T> = {__type: T};

function captures<T>(caps: T, f: (caps: T) => Sym<T>): Sym<T> {
  return f(caps);
}

function seq<T>(...syms: Sym<T>[]): Sym<T> {
  return syms as any;
}

// function defer<T>(f: () => Sym<T>): Sym<T> {
//   return f as any;
// }

const math = () => sum;

const sum = () => captures(
  {left: sum, op: '+', right: product},
  ({left, right}) => seq(left, '+', right)
);

const product = () => captures(
  {left: product, op: '*', right: number},
  ({left, right}) => seq(left, '*', right)
);

const number = /\d+/ as any as Sym<number>;





function testSeq<T, U>(a: T, b: U) {
  return [a, b] as const;
}

const testX = () => testSeq(testX, 3)

const x = testX();
