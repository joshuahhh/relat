{{
  function associateLeft(op, left, rights, range) {
    // TODO: fix ranges?
    return rights.reduce((left, right) => ({ type: "binary", op, left, right, range }), left);
  }

  function associateLeftWithOps(left, rights, range) {
    // TODO: fix ranges?
    return rights.reduce((left, [op, right]) => ({ type: "binary", op, left, right, range }), left);
  }

  function resolveSugar(op) {
    if (op === "Σ") { return "sum"; }
    return op;
  }
}}

/*
Order of precedence, from tightest to loosest:
1. ~ / ^ / * ("sub join")
2. . ("join")
3. some / not / #
4. &
5. +
*/

// This should go in order from loosest to tightest

Start = _ exp:Expression _ { return exp; }

Expression = E1

E1
  = left:E1b rights:(_ ";" _ right:E1b { return right })*
    { return associateLeft(";", left, rights, range()); }

E1b
  = left:E2 rights:(_ "," _ right:E2 { return right })*
    { return associateLeft(",", left, rights, range()); }

E2
  = left:E2b rights:(_ "-" _ right:E2b { return right })*
    { return associateLeft("-", left, rights, range()); }

E2b
  = left:E3 rights:(_ "&" _ right:E3 { return right })*
    { return associateLeft("&", left, rights, range()); }

E3
  = left:E4 _ op:("=<" / ">=" / "=" / "<" / ">") _ right: E4
    { return { type: "binary", op, left, right, range: range() }; }
  / E4

E4
  = op:("some" / "not" / "#" / "min" / "max" / "sum" / "Σ") _ operand:E4
    { return { type: "unary", op: resolveSugar(op), operand, range: range() }; }
  / E5

E5
  = left:E6 rights:(_ "[" _ right:Expression _ "]" { return ["[]", right] }
                     / _ "." _ right:E6 { return [".", right] })*
    { return associateLeftWithOps(left, rights, range()); }

E6
  = op:("^" / "*" / "~") _ operand:E6
    { return { type: "unary", op, operand, range: range() }; }
  / E7

E7
  = "let" _ variable:Identifier _ "=" _ value:Expression _ "|" _ body: Expression _
    { return { type: "let", variable, value, body, range: range() }; }
  / "(" _ exp:Expression _ ")"
    { return exp }
  / "{" _ variable:Identifier _ ":" _ constraint:Expression _ "|" _ body:Expression _ "}"
    { return { type: "comprehension", variable, constraint, body, range: range() }; }
  / number:($([1-9][0-9]*) / "0")
    { return { type: "constant", value: Number(number), range: range() }; }
  / "'" _ string:$([^']*) _ "'"
    { return { type: "constant", value: string, range: range() }; }
  / "\"" _ string:$([^"]*) _ "\""
    { return { type: "constant", value: string, range: range() }; }
  / "`" _ string:$([^`]*) _ "`"
    { return { type: "formula", formula: string, range: range() }; }
  / name:Identifier
    { return { type: "identifier", name, range: range() }; }

_ "whitespace"
  = [ \t\n\r]*

Identifier
  = name:$([a-z][a-zA-Z0-9]*)
    { return name; }
