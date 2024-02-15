/*
Order of precedence, from tightest to loosest:
1. ~ / ^ / *
2. .
3.
*/

Expression = E1

E1
  = "some" _ operand:Expression
  	{ return { type: "unary", op: "some", operand, range: range() } }
  / "not" _ operand:Expression
  	{ return { type: "unary", op: "not", operand, range: range() } }
  / E2

E2
  = left:E3 _ "=" _ right: E3
    { return { type: "binary", op: "=", left, right, range: range() } }
  / left:E3 _ "<" _ right: E3
    { return { type: "binary", op: "<", left, right, range: range() } }
  / left:E3 _ ">" _ right: E3
    { return { type: "binary", op: ">", left, right, range: range() } }
  / left:E3 _ "=<" _ right: E3
    { return { type: "binary", op: "=<", left, right, range: range() } }
  / left:E3 _ ">=" _ right: E3
    { return { type: "binary", op: ">=", left, right, range: range() } }
  / E3

E3
  = left:E4 rights:(_ "+" _ right:E4 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: "+", left, right, range: range() }), left) }
  / E4

E4
  = "#" _ operand:E5
  	{ return { type: "unary", op: "#", operand, range: range() } }
  / E4b

E4b
  = left:E5 rights:(_ "&" _ right:E5 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: "&", left, right, range: range() }), left) }
  / E5

E5
  = left:E6 rights:(_ "." _ right:E6 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: ".", left, right, range: range() }), left) }
  / E6

E6
  = "^" _ operand:Expression
  	{ return { type: "unary", op: "^", operand, range: range() } }
  / "*" _ operand:Expression
  	{ return { type: "unary", op: "*", operand, range: range() } }
  / "~" _ operand:Expression
  	{ return { type: "unary", op: "~", operand, range: range() } }
  / "let" _ variable:Identifier _ "=" _ value:Expression _ "|" _ body: Expression _
  	{ return { type: "let", variable, value, body, range: range() } }
  / "(" _ exp:Expression _ ")"
  	{ return exp }
  / "{" _ variable:Identifier _ ":" _ constraint:Expression _ "|" _ body:Expression _ "}"
  	{ return { type: "comprehension", variable, constraint, body, range: range() } }
  / number:$([1-9][0-9]*)
    { return { type: "literal", value: +number, range: range() } }
  / "'" _ string:$([^']*) _ "'"
  	{ return { type: "literal", value: string, range: range() } }
  / "\"" _ string:$([^']*) _ "\""
  	{ return { type: "literal", value: string, range: range() } }
  / name:Identifier
  	{ return { type: "identifier", name, range: range() } }

_ "whitespace"
  = [ \t\n\r]*

Identifier
  = name:$([a-z][a-zA-Z0-9]*)
    { return name }
