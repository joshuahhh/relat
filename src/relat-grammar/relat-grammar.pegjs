/*
Order of precedence, from tightest to loosest:
1. ~ / ^ / * ("sub join")
2. . ("join")
3. some / not / #
4. &
5. +
*/

// This should go in order from loosest to tightest

Start = _ exp:Expression _ { return exp }

Expression = E1

E1
  = left:E1b rights:(_ ";" _ right:E1b { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: ";", left, right, range: range() }), left) }
  / E1b

E1b
  = left:E2 rights:(_ "," _ right:E2 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: ",", left, right, range: range() }), left) }
  / E2

E2
  = left:E2b rights:(_ "-" _ right:E2b { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: "-", left, right, range: range() }), left) }
  / E2b

E2b
  = left:E3 rights:(_ "&" _ right:E3 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: "&", left, right, range: range() }), left) }
  / E3

E3
  = op:("some" / "not" / "#") _ operand:E3
    { return { type: "unary", op, operand, range: range() } }
  / E4

E4
  = left:E5 _ op:("=<" / ">=" / "=" / "<" / ">") _ right: E5
    { return { type: "binary", op, left, right, range: range() } }
  / E5

E5
  = left:E5b rights:(_ "[" _ right:Expression _ "]" { return right })*
    { return rights.reduce((left, right) => ({ type: "binary", op: "[]", left, right, range: range() }), left) }
  / E5b

E5b
  = left:E6 rights:(_ "." _ right:E6 { return right })*
    // TODO: fix ranges
    { return rights.reduce((left, right) => ({ type: "binary", op: ".", left, right, range: range() }), left) }
  / E6

E6
  = op:("^" / "*" / "~") _ operand:E7
    { return { type: "unary", op, operand, range: range() } }
  / E7

E7
  = "let" _ variable:Identifier _ "=" _ value:Expression _ "|" _ body: Expression _
  	{ return { type: "let", variable, value, body, range: range() } }
  / "(" _ exp:Expression _ ")"
  	{ return exp }
  / "{" _ variable:Identifier _ ":" _ constraint:Expression _ "|" _ body:Expression _ "}"
  	{ return { type: "comprehension", variable, constraint, body, range: range() } }
  / number:$([1-9][0-9]*)
    { return { type: "constant", value: Number(number), range: range() } }
  / "'" _ string:$([^']*) _ "'"
  	{ return { type: "constant", value: string, range: range() } }
  / "\"" _ string:$([^"]*) _ "\""
  	{ return { type: "constant", value: string, range: range() } }
  / "`" _ string:$([^`]*) _ "`"
  	{ return { type: "formula", formula: string, range: range() } }
  / name:Identifier
  	{ return { type: "identifier", name, range: range() } }

_ "whitespace"
  = [ \t\n\r]*

Identifier
  = name:$([a-z][a-zA-Z0-9]*)
    { return name }