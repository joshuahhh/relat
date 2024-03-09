import { ReactNode, memo, useEffect } from "react"

export const Syntax = memo(() => {
  useEffect(() => {
    document.body.classList.remove("viewer");
    document.body.classList.remove("dark");
  }, [])
  return <div className="p-12 font-classy max-w-prose mx-auto">
    <h1 className="text-4xl font-bold">Relat syntax</h1>
    All expressions in Relat are relations. Relation arguments can be numbers or symbols (Souffle's name for strings).
    <h2 className="text-2xl font-bold mt-8">Basics</h2>
    <Table>
      <Row
        syntax={<>
          <Code>123</Code>
          <BigSlash/>
          <Code>'abc'</Code>
          <BigSlash/>
          <Code>"abc"</Code>
        </>}
        description={<>constant literals</>}
      />
      <Row
        syntax={<Code><Var>var</Var></Code>}
        description={<>reference to variable</>}
      />
      <Row
        syntax={<Code>let <Var>var</Var> = <Var>exp1</Var> | <Var>exp2</Var></Code>}
        description={<>let-binding</>}
      />
      <Row
        syntax={<Code>(<Var>exp</Var>)</Code>}
        description={<>parentheses for grouping</>}
      />
      <Row
        syntax={<Code>`<Var>str</Var>`</Code>}
        description={<>formula <Details>escape hatch for abitrary constraints</Details></>}
      />
    </Table>
    <h2 className="text-2xl font-bold mt-8">Relational algebra</h2>
    <p className="py-2">Relat represents booleans as zero-argument relations, so boolean operators are specializations of relational operators.</p>
    <Table>
      <Row
        syntax={<Code><Var>exp1</Var>; <Var>exp2</Var></Code>}
        description={<>union <Details>also works as boolean OR</Details></>}
      />
      <Row
        syntax={<Code><Var>exp1</Var>, <Var>exp2</Var></Code>}
        description={<>product <Details>also works as boolean AND</Details></>}
      />
      <Row
        syntax={<Code><Var>exp1</Var> & <Var>exp2</Var></Code>}
        description={<>intersection <Details>also works as boolean AND</Details></>}
      />
      <Row
        syntax={<Code><Var>exp1</Var> \ <Var>exp2</Var></Code>}
        description={<>difference</>}
      />
      <Row
        syntax={<Code>some <Var>exp</Var></Code>}
        description={<>test if non-empty</>}
      />
      <Row
        syntax={<Code>not <Var>exp</Var></Code>}
        description={<>test if empty <Details>also works as boolean NOT</Details></>}
      />
      <Row
        syntax={<Code><Var>exp1</Var>.<Var>exp2</Var></Code>}
        description={<>dot join</>}
      />
      <Row
        syntax={<Code><Var>exp1</Var>[<Var>exp2</Var>]</Code>}
        description={<>(partial) relational application</>}
      />
      <Row
        syntax={<>
          <Code><Var>exp1</Var>._</Code>
          <BigSlash/>
          <Code>_.<Var>exp1</Var></Code>
          <BigSlash/>
          <Code><Var>exp1</Var>[_]</Code>
        </>}
        description={<>wildcard joins / application<Details>projections</Details></>}
      />
      <Row
        syntax={<Code>~<Var>exp</Var></Code>}
        description={<>transpose of <Var>exp</Var></>}
      />
      <Row
        syntax={<Code>^<Var>exp</Var></Code>}
        description={<>transitive closure of <Var>exp</Var></>}
      />
      <Row
        syntax={<>
          <Code><Var>exp1</Var> {'<:'} <Var>exp2</Var></Code>
          <BigSlash/>
          <Code><Var>exp1</Var> {':>'} <Var>exp2</Var></Code>
        </>}
        description={<>prefix / suffix join</>}
      />
    </Table>
    <h2 className="text-2xl font-bold mt-8">Relational abstraction</h2>
    <p className="py-2">Whereas relational algebra is "pointless" (it operates on relations as a whole), relational abstraction is "pointed" (it extracts arguments of relations). It is similar to "comprehensions" in languages like Python, but more general.</p>
    <Table>
      <Row
        syntax={<Code><Var>var1[, var2, ...]</Var> : <Var>exp1</Var> | <Var>exp2</Var></Code>}
        description={<>relational abstraction (for-style) <Details>result includes <Var>var1[, var2, ...]</Var> and <Var>exp2</Var></Details></>}
      />
      <Row
        syntax={<Code><Var>var1[, var2, ...]</Var> : <Var>exp1</Var> {'->'} <Var>exp2</Var></Code>}
        description={<>relational abstraction (from-style) <Details>result only includes <Var>exp2</Var></Details></>}
      />
    </Table>
    <h2 className="text-2xl font-bold mt-8">Aggregates</h2>
    <p className="py-2">Aggregates operate on the last argument of a relation, without removal of duplicate values.</p>
    <Table>
      <Row
        syntax={<Code>#<Var>exp</Var></Code>}
        description={<>count</>}
      />
      <Row
        syntax={<>
          <Code>min <Var>exp</Var></Code>
          <BigSlash/>
          <Code>max <Var>exp</Var></Code>
        </>}
        description={<>min / max <Details>applicable to numbers or symbols</Details></>}
      />
      <Row
        syntax={<Code>sum <Var>exp</Var></Code>}
        description={<>sum <Details>applicable to numbers</Details></>}
      />
      <Row
        syntax={<Code>concat <Var>exp</Var></Code>}
        description={<>concatenate <Details>applicable to symbols; arbitrary order</Details></>}
      />
      <Row
        syntax={<Code>index <Var>exp</Var></Code>}
        description={<>add argument with unique indices <Details>not itself an aggregate, but useful for building them</Details></>}
      />
    </Table>
    <h2 className="text-2xl font-bold mt-8">Scalar operators</h2>
    <p className="py-2">Scalar operators operate on 1-argument relations.</p>
    <Table>
      <Row
        syntax={<>
          <Code><Var>exp1</Var> + <Var>exp2</Var></Code>
          <BigSlash/>
          <Code><Var>exp1</Var> - <Var>exp2</Var></Code>
          <BigSlash/>
          <Code><Var>exp1</Var> * <Var>exp2</Var></Code>
        </>}
        description={<>add / subtract / multiply <Details>applicable to numbers</Details></>}
      />
      <Row
        syntax={<>
          <Code><Var>exp1</Var> {'<'} <Var>exp2</Var></Code>
          <BigSlash/>
          <Code><Var>exp1</Var> {'>'} <Var>exp2</Var></Code>
          <BigSlash/>
          <Code><Var>exp1</Var> {'<='} <Var>exp2</Var></Code>
          <BigSlash/>
          <Code><Var>exp1</Var> {'>='} <Var>exp2</Var></Code>
          <BigSlash/>
          <Code><Var>exp1</Var> = <Var>exp2</Var></Code>
        </>}
        description={<>comparisons <Details>applicable to numbers or symbols</Details></>}
      />
    </Table>
    <h2 className="text-2xl font-bold mt-8">JavaScript objects</h2>
    <p className="py-2">Relat is most fundamentally run with Souffle relations as input. With the experimental <code>mkJsObjDB</code> adapter, it can run directly on a network of JavaScript objects.</p>
    <Table>
      <Row
        syntax={<Code>{'<'}<Var>prop</Var>{'>'}</Code>}
        description={<>property access <Details>a relation mapping <Var>obj</Var> to <Code><Var>obj</Var>.<Var>prop</Var></Code></Details></>}
      />
      <Row
        syntax={<Code>{'<_>'}</Code>}
        description={<>wildcard property access</>}
      />
    </Table>
  </div>
})

export const Table = memo((props: {
  children: ReactNode,
}) => {
  return <table
    className="-mx-2 w-full"
  >
    <thead>
      <Row
        syntax="Syntax"
        description="Description"
        example="Example"
        rel="vs Rel"
        souffle="vs Souffle"
        Cell="th"
      />
    </thead>
    <tbody>
      {props.children}
    </tbody>
  </table>;
});

export const Row = memo((props: {
  syntax: ReactNode,
  description?: ReactNode,
  example?: ReactNode,
  rel?: ReactNode,
  souffle?: ReactNode,
  Cell?: keyof JSX.IntrinsicElements,
}) => {
  const { Cell = "td" } = props;
  return <tr>
    <Cell className="align-top text-right px-2 w-1/2">{props.syntax}</Cell>
    <Cell className="align-top text-left px-2">{props.description}</Cell>
    {/* <Cell className="align-top text-left px-2">{props.example}</Cell> */}
    {/* <Cell className="align-top text-left px-2">{props.rel}</Cell> */}
    {/* <Cell className="align-top text-left px-2">{props.souffle}</Cell> */}
  </tr>;
});

export const Var = memo((props: {
  children: ReactNode,
}) => {
  return <span className="text-blue-600 italic font-classy">{props.children}</span>;
});

export const Code = memo((props: {
  children: ReactNode,
}) => {
  return <code className="whitespace-pre">{props.children}</code>;
});

export const Details = memo((props: {
  children: ReactNode,
}) => {
  return <div className="text-sm pl-2 italic">{props.children}</div>;
});

export const BigSlash = memo(() => {
  // return <br/>;
  return <span
    className="font-classy text-xl px-2 align-middle tracking-[-3px] leading-[0] inline-block h-0"
  >{'||'}</span>;
});
