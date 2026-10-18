import Decimal from 'decimal.js';

type ExpressionValue = string | boolean | null | Decimal;
type ExpressionNode =
  | { kind: 'literal'; value: ExpressionValue }
  | { kind: 'variable'; fieldId: string }
  | { kind: 'unary'; operator: string; operand: ExpressionNode }
  | { kind: 'binary'; operator: string; left: ExpressionNode; right: ExpressionNode };

interface Token {
  kind: 'literal' | 'variable' | 'operator' | 'end';
  text: string;
  value?: ExpressionValue;
}

const Numeric = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
const precedence: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '>': 4, '>=': 4, '<': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6 };

class Parser {
  private position = 0;
  private token: Token;

  constructor(private expression: string, private declaredFields: ReadonlySet<string>, private arithmetic: boolean) {
    if (!expression.trim() || expression.length > 500) throw new Error('表达式不能为空且最多500字符');
    this.token = this.readToken();
  }

  parse(): ExpressionNode {
    const result = this.binary(1, 0);
    if (this.token.kind !== 'end') throw new Error('表达式包含未支持的语法');
    return result;
  }

  private advance(): Token {
    const previous = this.token;
    this.token = this.readToken();
    return previous;
  }

  private readToken(): Token {
    while (this.position < this.expression.length && /[ \t\r\n]/.test(this.expression[this.position])) this.position += 1;
    const remainder = this.expression.slice(this.position);
    if (!remainder) return { kind: 'end', text: '' };
    if (remainder.startsWith('${')) {
      const variable = /^\$\{([A-Za-z_][A-Za-z0-9_]{0,99})\}/.exec(remainder);
      if (!variable || !this.declaredFields.has(variable[1]) || ['__proto__', 'constructor', 'prototype'].includes(variable[1])) throw new Error('表达式引用了未声明字段');
      this.position += variable[0].length;
      return { kind: 'variable', text: variable[1] };
    }
    if (remainder[0] === "'") {
      this.position += 1;
      let value = '';
      while (this.position < this.expression.length) {
        const character = this.expression[this.position++];
        if (character === "'") return { kind: 'literal', text: value, value };
        if (character === '\\') {
          const escaped = this.expression[this.position++];
          if (escaped !== '\\' && escaped !== "'") throw new Error('字符串仅支持引号与反斜线转义');
          value += escaped;
        } else {
          if (character.charCodeAt(0) < 32) throw new Error('字符串不能包含控制字符');
          value += character;
        }
      }
      throw new Error('字符串缺少结束引号');
    }
    const number = /^(?:0|[1-9]\d*)(?:\.\d+)?/.exec(remainder);
    if (number) {
      this.position += number[0].length;
      return { kind: 'literal', text: number[0], value: new Numeric(number[0]) };
    }
    const keyword = /^(true|false|null)\b/.exec(remainder);
    if (keyword) {
      this.position += keyword[0].length;
      return { kind: 'literal', text: keyword[0], value: keyword[0] === 'null' ? null : keyword[0] === 'true' };
    }
    const operator = /^(==|!=|>=|<=|&&|\|\||[!><()+\-*/])/.exec(remainder);
    if (!operator) throw new Error('表达式包含未支持的字符');
    this.position += operator[0].length;
    return { kind: 'operator', text: operator[0] };
  }

  private binary(minimum: number, depth: number): ExpressionNode {
    let left = this.unary(depth);
    while (this.token.kind === 'operator' && Object.hasOwn(precedence, this.token.text) && precedence[this.token.text] >= minimum) {
      const operator = this.advance().text;
      if (!this.arithmetic && ['+', '-', '*', '/'].includes(operator)) throw new Error('字段条件不支持算术运算');
      const right = this.binary(precedence[operator] + 1, depth);
      left = { kind: 'binary', operator, left, right };
    }
    return left;
  }

  private unary(depth: number): ExpressionNode {
    if (depth > 5) throw new Error('表达式嵌套最多5层');
    if (this.token.kind === 'operator' && ['!', '-'].includes(this.token.text)) {
      const operator = this.advance().text;
      const operand = this.unary(depth + 1);
      if (!this.arithmetic && operator === '-' && (operand.kind !== 'literal' || !(operand.value instanceof Decimal))) throw new Error('字段条件仅支持负数字面量');
      return { kind: 'unary', operator, operand };
    }
    if (this.token.kind === 'operator' && this.token.text === '(') {
      this.advance();
      const expression = this.binary(1, depth + 1);
      if (this.advance().text !== ')') throw new Error('表达式括号不匹配');
      return expression;
    }
    const token = this.advance();
    if (token.kind === 'literal') return { kind: 'literal', value: token.value! };
    if (token.kind === 'variable') return { kind: 'variable', fieldId: token.text };
    throw new Error('表达式缺少有效值');
  }
}

const numeric = (value: ExpressionValue): Decimal => {
  if (value instanceof Decimal) return value;
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || value.length > 128) throw new Error('表达式需要有效数字');
  return new Numeric(value);
};

const boolean = (value: ExpressionValue): boolean => {
  if (typeof value !== 'boolean') throw new Error('表达式需要布尔值');
  return value;
};

const variableValue = (data: Readonly<Record<string, unknown>>, fieldId: string): ExpressionValue => {
  if (!Object.hasOwn(data, fieldId) || data[fieldId] === undefined || data[fieldId] === null) return null;
  const value = data[fieldId];
  if (value instanceof Decimal) return new Numeric(value);
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Numeric(String(value));
  throw new Error('表达式字段只能为文字、数字或布尔值');
};

const evaluate = (node: ExpressionNode, data: Readonly<Record<string, unknown>>): ExpressionValue => {
  if (node.kind === 'literal') return node.value;
  if (node.kind === 'variable') return variableValue(data, node.fieldId);
  if (node.kind === 'unary') {
    const value = evaluate(node.operand, data);
    return node.operator === '!' ? !boolean(value) : numeric(value).negated();
  }
  const left = evaluate(node.left, data);
  if (node.operator === '&&') return boolean(left) && boolean(evaluate(node.right, data));
  if (node.operator === '||') return boolean(left) || boolean(evaluate(node.right, data));
  const right = evaluate(node.right, data);
  if (['+', '-', '*', '/'].includes(node.operator)) {
    const first = numeric(left);
    const second = numeric(right);
    if (node.operator === '+') return first.plus(second);
    if (node.operator === '-') return first.minus(second);
    if (node.operator === '*') return first.times(second);
    if (second.isZero()) throw new Error('表达式不能除以零');
    return first.div(second);
  }
  const comparison = left === null || right === null ? left === right ? 0 : null
    : left instanceof Decimal || right instanceof Decimal ? numeric(left).comparedTo(numeric(right))
      : typeof left === typeof right ? left === right ? 0 : left < right ? -1 : 1 : null;
  if (node.operator === '==') return comparison === 0;
  if (node.operator === '!=') return comparison !== 0;
  if (comparison === null || typeof left === 'boolean' || typeof right === 'boolean') throw new Error('比较运算的值类型不一致');
  if (node.operator === '>') return comparison > 0;
  if (node.operator === '>=') return comparison >= 0;
  if (node.operator === '<') return comparison < 0;
  return comparison <= 0;
};

export const validateFormExpression = (expression: string, declaredFields: ReadonlySet<string>): string | null => {
  try { new Parser(expression, declaredFields, false).parse(); return null; }
  catch (cause) { return cause instanceof Error ? cause.message : '表达式无效'; }
};

export const evaluateFormExpression = (
  expression: string, data: Readonly<Record<string, unknown>>, declaredFields: ReadonlySet<string>,
): { valid: boolean; value: boolean } => {
  try { return { valid: true, value: boolean(evaluate(new Parser(expression, declaredFields, false).parse(), data)) }; }
  catch { return { valid: false, value: false }; }
};

export const evaluateNumericExpression = (
  expression: string, data: Readonly<Record<string, unknown>>, declaredFields: ReadonlySet<string>,
): string => numeric(evaluate(new Parser(expression, declaredFields, true).parse(), data)).toFixed();
