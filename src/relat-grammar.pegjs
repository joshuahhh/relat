/*
Order of precedence, from tightest to loosest:
1. ~ / ^ / * ("sub join")
2. . ("join")
3. some / not / #
4. &
5. +
*/

// This should go in order from loosest to tightest

Expression = E1

E1
  = left:E2 rights:(_ "+" _ right:E2 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: "+", left, right, range: range() }), left) }
  / E2

E2
  = left:E3 rights:(_ "&" _ right:E3 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: "&", left, right, range: range() }), left) }
  / E3

E3
  = "some" _ operand:E3
  	{ return { type: "unary", op: "some", operand, range: range() } }
  / "not" _ operand:E3
  	{ return { type: "unary", op: "not", operand, range: range() } }
  / "#" _ operand:E3
  	{ return { type: "unary", op: "#", operand, range: range() } }
  / E4

E4
  = left:E5 _ "=" _ right: E5
    { return { type: "binary", op: "=", left, right, range: range() } }
  / left:E5 _ "<" _ right: E5
    { return { type: "binary", op: "<", left, right, range: range() } }
  / left:E5 _ ">" _ right: E5
    { return { type: "binary", op: ">", left, right, range: range() } }
  / left:E5 _ "=<" _ right: E5
    { return { type: "binary", op: "=<", left, right, range: range() } }
  / left:E5 _ ">=" _ right: E5
    { return { type: "binary", op: ">=", left, right, range: range() } }
  / E5

E5
  = "^" _ operand:E5
  	{ return { type: "unary", op: "^", operand, range: range() } }
  / "*" _ operand:E5
  	{ return { type: "unary", op: "*", operand, range: range() } }
  / "~" _ operand:E5
  	{ return { type: "unary", op: "~", operand, range: range() } }
  / E6

E6
  = left:E7 rights:(_ "." _ right:E7 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: ".", left, right, range: range() }), left) }
  / E7

E7
  = "let" _ variable:Identifier _ "=" _ value:Expression _ "|" _ body: Expression _
  	{ return { type: "let", variable, value, body, range: range() } }
  / "(" _ exp:Expression _ ")"
  	{ return exp }
  / "{" _ variable:Identifier _ ":" _ constraint:Expression _ "|" _ body:Expression _ "}"
  	{ return { type: "comprehension", variable, constraint, body, range: range() } }
  / number:$([1-9][0-9]*)
    { return { type: "constant", value: +number, range: range() } }
  / "'" _ string:$([^']*) _ "'"
  	{ return { type: "constant", value: string, range: range() } }
  / "\"" _ string:$([^"]*) _ "\""
  	{ return { type: "constant", value: string, range: range() } }
  / name:Identifier
  	{ return { type: "identifier", name, range: range() } }

_ "whitespace"
  = [ \t\n\r]*

Identifier
  = name:$([a-z][a-zA-Z0-9]*)
    { return name }
