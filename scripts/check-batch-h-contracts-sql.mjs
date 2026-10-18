import { createHash } from 'node:crypto';

export class SqlError extends Error {
  constructor(message, token = {}) {
    super(`${token.file ?? '<sql>'}:${token.line ?? 1}: ${message}`);
    this.name = 'SqlError';
    this.file = token.file;
    this.line = token.line;
  }
}

export class Decimal {
  constructor(numerator, denominator = 1n) {
    if (denominator === 0n) throw new Error('division by zero');
    let divisor = numerator < 0n ? -numerator : numerator;
    let remainder = denominator < 0n ? -denominator : denominator;
    while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
    const sign = denominator < 0n ? -1n : 1n;
    this.numerator = numerator / (divisor || 1n) * sign;
    this.denominator = denominator / (divisor || 1n) * sign;
  }
  static from(value) {
    if (value instanceof Decimal) return value;
    if (typeof value === 'boolean') return new Decimal(value ? 1n : 0n);
    const match = String(value).match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!match || !(match[2] || match[3])) throw new Error(`non-numeric SQL value: ${String(value)}`);
    const scale = (match[3]?.length ?? 0) - Number(match[4] ?? 0);
    const numerator = BigInt(`${match[1]}${match[2] || '0'}${match[3] ?? ''}`);
    return scale < 0 ? new Decimal(numerator * 10n ** BigInt(-scale)) : new Decimal(numerator, 10n ** BigInt(scale));
  }
  add(value) {
    const other = Decimal.from(value);
    return new Decimal(this.numerator * other.denominator + other.numerator * this.denominator, this.denominator * other.denominator);
  }
  subtract(value) { return this.add(Decimal.from(value).multiply(-1)); }
  multiply(value) {
    const other = Decimal.from(value);
    return new Decimal(this.numerator * other.numerator, this.denominator * other.denominator);
  }
  divide(value) {
    const other = Decimal.from(value);
    return new Decimal(this.numerator * other.denominator, this.denominator * other.numerator);
  }
  compare(value) {
    const difference = this.subtract(value).numerator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }
  round(scale = 0) {
    const factor = 10n ** BigInt(scale);
    const scaled = this.numerator * factor;
    const absolute = scaled < 0n ? -scaled : scaled;
    const rounded = (absolute * 2n + this.denominator) / (2n * this.denominator);
    return new Decimal(scaled < 0n ? -rounded : rounded, factor);
  }
  toString() {
    if (this.denominator === 1n) return String(this.numerator);
    let remainder = this.denominator;
    let twos = 0;
    let fives = 0;
    while (remainder % 2n === 0n) { remainder /= 2n; twos += 1; }
    while (remainder % 5n === 0n) { remainder /= 5n; fives += 1; }
    if (remainder !== 1n) return `${this.numerator}/${this.denominator}`;
    const scale = Math.max(twos, fives);
    const negative = this.numerator < 0n;
    const magnitude = (negative ? -this.numerator : this.numerator) * 10n ** BigInt(scale) / this.denominator;
    const digits = String(magnitude).padStart(scale + 1, '0');
    return `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/0+$/, '').replace(/\.$/, '');
  }
  toJSON() { return this.toString(); }
}

export const text = value => value === null || value === undefined ? null : String(value);
export const numeric = value => Number(Decimal.from(value).toString());
export const stable = value => JSON.stringify(value, (key, entry) => entry instanceof Map ? [...entry] : entry);
export const truth = value => value !== null && value !== undefined && (value instanceof Decimal ? value.numerator !== 0n : Boolean(value));

function compare(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return left.length - right.length;
    for (let index = 0; index < left.length; index += 1) {
      const compared = compare(left[index], right[index]);
      if (compared) return compared;
    }
    return 0;
  }
  if (left instanceof Decimal || right instanceof Decimal || typeof left === 'boolean' || typeof right === 'boolean') return Decimal.from(left).compare(right);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function scanSql(source, file = '<sql>') {
  const tokens = [];
  const comments = [];
  let offset = 0;
  let line = 1;
  const token = (kind, value, start, startLine) => ({ kind, value, raw: source.slice(start, offset), start, end: offset, line: startLine, file });
  while (offset < source.length) {
    const character = source[offset];
    if (/\s|\uFEFF/.test(character)) { if (character === '\n') line += 1; offset += 1; continue; }
    const start = offset;
    const startLine = line;
    if (character === '#' || (source.startsWith('--', offset) && /\s|^$/.test(source[offset + 2] ?? ''))) {
      while (offset < source.length && source[offset] !== '\n') offset += 1;
      comments.push(token('comment', source.slice(start, offset), start, startLine));
      continue;
    }
    if (source.startsWith('/*', offset)) {
      const end = source.indexOf('*/', offset + 2);
      if (end < 0) throw new SqlError('unterminated comment', { file, line });
      if (source[offset + 2] === '!') {
        const prefix = source.slice(offset, end).match(/^\/\*!\d*\s*/)[0];
        const nestedStart = offset + prefix.length;
        const nested = scanSql(source.slice(nestedStart, end), file);
        const prefixLines = (prefix.match(/\n/g) ?? []).length;
        tokens.push(...nested.tokens.map(entry => ({ ...entry, start: entry.start + nestedStart, end: entry.end + nestedStart, line: entry.line + startLine + prefixLines - 1 })));
      }
      offset = end + 2;
      line += (source.slice(start, offset).match(/\n/g) ?? []).length;
      comments.push(token('comment', source.slice(start, offset), start, startLine));
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      offset += 1;
      let value = '';
      let closed = false;
      while (offset < source.length) {
        const current = source[offset++];
        if (current === '\n') line += 1;
        if (current === character) {
          if (source[offset] === character) { value += character; offset += 1; continue; }
          closed = true;
          break;
        }
        if (current === '\\' && character !== '`') {
          const escaped = source[offset++];
          if (escaped === undefined) break;
          if (escaped === '\n') line += 1;
          value += ({ '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a', '%': '\\%', _: '\\_' })[escaped] ?? escaped;
        } else value += current;
      }
      if (!closed) throw new SqlError('unterminated quoted value', { file, line: startLine });
      tokens.push(token(character === '`' ? 'word' : 'string', value, start, startLine));
      continue;
    }
    const number = source.slice(offset).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) { offset += number[0].length; tokens.push(token('number', number[0], start, startLine)); continue; }
    const identifier = source.slice(offset).match(/^[\p{L}_$][\p{L}\p{N}_$]*/u);
    if (identifier) { offset += identifier[0].length; tokens.push(token('word', identifier[0], start, startLine)); continue; }
    const operator = ['<=>', '<=', '>=', '<>', '!=', ':=', '||', '&&'].find(candidate => source.startsWith(candidate, offset));
    offset += operator?.length ?? 1;
    tokens.push(token('symbol', operator ?? character, start, startLine));
  }
  return { tokens, comments, source, file };
}

export const word = token => token?.kind === 'word' ? token.value.toUpperCase() : token?.kind === 'symbol' ? token.value : undefined;
export const canonical = tokens => tokens.map(entry => entry.kind === 'word' ? entry.value.toLowerCase() : entry.kind === 'number' ? Decimal.from(entry.value).toString() : `${entry.kind}:${entry.value}`).join(' ');

export function splitTop(tokens, separator = ',') {
  const result = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (word(tokens[index]) === '(') depth += 1;
    if (word(tokens[index]) === ')') depth -= 1;
    if (depth < 0) throw new SqlError('unbalanced parentheses', tokens[index]);
    if (depth === 0 && word(tokens[index]) === separator) { result.push(tokens.slice(start, index)); start = index + 1; }
  }
  if (depth !== 0) throw new SqlError('unbalanced parentheses', tokens[0]);
  if (start < tokens.length) result.push(tokens.slice(start));
  return result;
}

export function statements(scan) { return splitTop(scan.tokens, ';'); }

export class Cursor {
  constructor(tokens) { this.tokens = tokens; this.index = 0; }
  peek(distance = 0) { return word(this.tokens[this.index + distance]); }
  take() {
    if (this.index >= this.tokens.length) throw new SqlError('unexpected end of SQL', this.tokens.at(-1));
    return this.tokens[this.index++];
  }
  accept(value) { if (this.peek() !== value) return false; this.index += 1; return true; }
  expect(value) { if (!this.accept(value)) throw new SqlError(`expected ${value}, found ${this.peek()}`, this.tokens[this.index] ?? this.tokens.at(-1)); }
  name() {
    const parts = [this.take().value.toLowerCase()];
    while (this.accept('.')) parts.push(this.take().value.toLowerCase());
    return parts.at(-1);
  }
  group() {
    this.expect('(');
    const start = this.index;
    let depth = 1;
    while (depth && this.index < this.tokens.length) {
      const current = this.take();
      if (word(current) === '(') depth += 1;
      if (word(current) === ')') depth -= 1;
    }
    if (depth) throw new SqlError('unclosed group', this.tokens[start - 1]);
    return this.tokens.slice(start, this.index - 1);
  }
  done() { if (this.index < this.tokens.length) throw new SqlError(`unsupported SQL near ${this.tokens.slice(this.index, this.index + 8).map(entry => entry.raw).join(' ')}`, this.tokens[this.index]); }
}

const precedence = { OR: 1, XOR: 2, AND: 3, '=': 4, '<>': 4, '!=': 4, '<=>': 4, '<': 4, '>': 4, '<=': 4, '>=': 4, IS: 4, IN: 4, BETWEEN: 4, LIKE: 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, MOD: 6, DIV: 6 };

export function expression(tokens) {
  const cursor = new Cursor(tokens);
  const result = parseExpression(cursor);
  cursor.done();
  return result;
}

function parseExpression(cursor, minimum = 0) {
  const first = cursor.take();
  const firstWord = word(first);
  let result;
  if (first.kind === 'string') result = { type: 'literal', value: first.value };
  else if (first.kind === 'number') result = { type: 'literal', value: Decimal.from(first.value) };
  else if (['NULL', 'TRUE', 'FALSE'].includes(firstWord)) result = { type: 'literal', value: firstWord === 'NULL' ? null : firstWord === 'TRUE' };
  else if (['NOT', '-', '+'].includes(firstWord)) result = { type: 'unary', operator: firstWord, operand: parseExpression(cursor, firstWord === 'NOT' ? 4 : 7) };
  else if (firstWord === '(') {
    cursor.index -= 1;
    const grouped = cursor.group();
    const parts = splitTop(grouped);
    result = word(grouped[0]) === 'SELECT' ? { type: 'scalar', query: parseSelect(grouped) } : parts.length > 1 ? { type: 'tuple', entries: parts.map(expression) } : expression(grouped);
  } else if (firstWord === 'EXISTS') result = { type: 'exists', query: parseSelect(cursor.group()) };
  else if (firstWord === 'CASE') {
    const base = cursor.peek() === 'WHEN' ? null : parseExpression(cursor);
    const branches = [];
    while (cursor.accept('WHEN')) {
      const condition = parseExpression(cursor);
      cursor.expect('THEN');
      branches.push({ condition, value: parseExpression(cursor) });
    }
    const fallback = cursor.accept('ELSE') ? parseExpression(cursor) : { type: 'literal', value: null };
    cursor.expect('END');
    result = { type: 'case', base, branches, fallback };
  } else if (firstWord === 'INTERVAL') result = { type: 'interval', amount: parseExpression(cursor), unit: cursor.take().value.toUpperCase() };
  else if (firstWord === '@') result = { type: 'variable', name: cursor.take().value.toLowerCase() };
  else if (firstWord === '*') result = { type: 'star' };
  else if (first.kind === 'word') {
    if (cursor.peek() === '(') {
      const argumentTokens = cursor.group();
      if (firstWord === 'CAST') {
        const castCursor = new Cursor(argumentTokens);
        const operand = parseExpression(castCursor);
        castCursor.expect('AS');
        const castType = castCursor.take().value.toUpperCase();
        if (castCursor.peek() === '(') castCursor.group();
        castCursor.done();
        result = { type: 'cast', operand, castType };
      } else result = { type: 'call', name: firstWord, arguments: splitTop(argumentTokens).map(expression) };
    } else {
      const parts = [first.value.toLowerCase()];
      while (cursor.accept('.')) parts.push(cursor.take().value.toLowerCase());
      result = { type: 'reference', parts };
    }
  } else throw new SqlError(`unsupported expression: ${first.raw}`, first);
  result.token ??= first;
  while (cursor.index < cursor.tokens.length) {
    let operator = cursor.peek();
    const negate = operator === 'NOT' && ['IN', 'BETWEEN', 'LIKE'].includes(cursor.peek(1));
    if (negate) operator = cursor.peek(1);
    const rank = precedence[operator];
    if (rank === undefined || rank < minimum) break;
    cursor.index += negate ? 2 : 1;
    if (operator === 'IS') {
      const isNot = cursor.accept('NOT');
      const target = cursor.take();
      if (!['NULL', 'TRUE', 'FALSE'].includes(word(target))) throw new SqlError('unsupported IS comparison', target);
      result = { type: 'is', operand: result, target: word(target), negate: isNot, token: first };
    } else if (operator === 'IN') {
      const entries = cursor.group();
      result = { type: 'in', operand: result, negate, entries: word(entries[0]) === 'SELECT' ? parseSelect(entries) : splitTop(entries).map(expression), token: first };
    } else if (operator === 'BETWEEN') {
      const lower = parseExpression(cursor, rank + 1);
      cursor.expect('AND');
      result = { type: 'between', operand: result, lower, upper: parseExpression(cursor, rank + 1), negate, token: first };
    } else result = { type: 'binary', operator, left: result, right: parseExpression(cursor, rank + 1), negate, token: first };
  }
  return result;
}

function parseColumn(tokens) {
  const cursor = new Cursor(tokens);
  const name = cursor.take().value.toLowerCase();
  let type = cursor.take().value.toUpperCase();
  if (type === 'INTEGER') type = 'INT';
  const argumentTokens = cursor.peek() === '(' ? cursor.group() : [];
  const width = ['BIGINT', 'INT', 'SMALLINT', 'MEDIUMINT', 'TINYINT'].includes(type) ? null : canonical(argumentTokens) || null;
  const definition = { name, type, width, nullable: true, default: null, autoIncrement: false, unsigned: false, charset: null, collation: null, onUpdate: null, generated: null, generationStorage: null, comment: null, checks: [], primary: false, unique: false, token: tokens[0] };
  let explicitDefault = false;
  while (cursor.index < tokens.length) {
    const option = cursor.take();
    switch (word(option)) {
      case 'NOT': cursor.expect('NULL'); definition.nullable = false; break;
      case 'NULL': definition.nullable = true; break;
      case 'DEFAULT': definition.default = parseExpression(cursor, 7); explicitDefault = true; break;
      case 'AUTO_INCREMENT': definition.autoIncrement = true; break;
      case 'UNSIGNED': definition.unsigned = true; break;
      case 'ZEROFILL': throw new SqlError('unsupported ZEROFILL', option);
      case 'COMMENT': definition.comment = cursor.take().value; break;
      case 'CHARACTER': cursor.expect('SET'); definition.charset = cursor.take().value.toLowerCase(); break;
      case 'COLLATE': definition.collation = cursor.take().value.toLowerCase(); break;
      case 'ON': cursor.expect('UPDATE'); definition.onUpdate = parseExpression(cursor, 7); break;
      case 'PRIMARY': cursor.expect('KEY'); definition.primary = true; definition.nullable = false; break;
      case 'UNIQUE': cursor.accept('KEY'); definition.unique = true; break;
      case 'CHECK': definition.checks.push(expression(cursor.group())); break;
      case 'GENERATED':
        cursor.expect('ALWAYS'); cursor.expect('AS');
        definition.generated = expression(cursor.group());
        definition.generationStorage = ['STORED', 'VIRTUAL'].includes(cursor.peek()) ? word(cursor.take()) : 'VIRTUAL';
        break;
      case 'AFTER': cursor.take(); break;
      case 'FIRST': break;
      default: throw new SqlError(`unsupported column attribute ${option.raw}`, option);
    }
  }
  if (!explicitDefault) definition.default = definition.nullable ? { type: 'literal', value: null } : null;
  if (definition.generated && (explicitDefault || definition.autoIncrement || definition.onUpdate)) throw new SqlError('generated column has incompatible writable attributes', tokens[0]);
  return definition;
}

function addDefinition(table, tokens) {
  const cursor = new Cursor(tokens);
  if (cursor.peek() === 'FOREIGN') throw new SqlError('physical foreign key is outside the H contract', tokens[0]);
  if (cursor.peek() === 'CONSTRAINT' || cursor.peek() === 'CHECK') {
    const name = cursor.accept('CONSTRAINT') ? cursor.take().value.toLowerCase() : `check_${table.checks.size + 1}`;
    cursor.expect('CHECK');
    const condition = cursor.group();
    if (cursor.accept('NOT')) throw new SqlError('CHECK NOT ENFORCED is not a constraint', tokens[0]);
    cursor.accept('ENFORCED');
    cursor.done();
    if (table.checks.has(name)) throw new SqlError(`duplicate constraint ${name}`, tokens[0]);
    table.checks.set(name, { name, expression: expression(condition), canonical: canonical(condition), token: tokens[0] });
    return;
  }
  if (['PRIMARY', 'UNIQUE', 'KEY', 'INDEX'].includes(cursor.peek())) {
    const primary = cursor.accept('PRIMARY');
    const unique = primary || cursor.accept('UNIQUE');
    if (!cursor.accept('KEY')) cursor.expect('INDEX');
    const name = primary ? 'primary' : cursor.take().value.toLowerCase();
    if (cursor.accept('USING')) cursor.take();
    const columns = splitTop(cursor.group()).map(column => ({ name: column[0].value.toLowerCase(), suffix: canonical(column.slice(1)) }));
    if (cursor.accept('USING')) cursor.take();
    if (cursor.accept('COMMENT')) cursor.take();
    cursor.done();
    if (table.indexes.has(name)) throw new SqlError(`duplicate index ${name}`, tokens[0]);
    table.indexes.set(name, { name, unique, columns, token: tokens[0] });
    return;
  }
  const column = parseColumn(tokens);
  if (table.columns.has(column.name)) throw new SqlError(`duplicate column ${column.name}`, tokens[0]);
  table.columns.set(column.name, column);
  if (column.primary || column.unique) {
    const name = column.primary ? 'primary' : column.name;
    table.indexes.set(name, { name, unique: true, columns: [{ name: column.name, suffix: '' }], token: tokens[0] });
  }
  for (const condition of column.checks) table.checks.set(`${column.name}_${table.checks.size}`, { name: column.name, expression: condition, canonical: stable(condition), token: tokens[0] });
}

export function parseCreate(tokens) {
  const cursor = new Cursor(tokens);
  cursor.expect('CREATE');
  const temporary = cursor.accept('TEMPORARY');
  cursor.expect('TABLE');
  if (cursor.accept('IF')) { cursor.expect('NOT'); cursor.expect('EXISTS'); }
  const name = cursor.name();
  const table = { name, temporary, columns: new Map(), indexes: new Map(), checks: new Map(), options: {}, token: tokens[0] };
  for (const definition of splitTop(cursor.group())) addDefinition(table, definition);
  while (cursor.index < tokens.length) {
    cursor.accept('DEFAULT');
    const option = cursor.take().value.toUpperCase();
    if (option === 'CHARACTER') cursor.expect('SET');
    cursor.accept('=');
    table.options[option === 'CHARACTER' ? 'CHARSET' : option] = cursor.take().value;
  }
  return table;
}

export function parseAlter(tokens) {
  const cursor = new Cursor(tokens);
  cursor.expect('ALTER'); cursor.expect('TABLE');
  const name = cursor.name();
  const table = { name, columns: new Map(), indexes: new Map(), checks: new Map(), options: {}, token: tokens[0] };
  for (const entry of splitTop(tokens.slice(cursor.index))) {
    const action = new Cursor(entry);
    if (!['ADD', 'MODIFY'].includes(action.peek())) throw new SqlError('only confirmed ADD/MODIFY is accepted in design deltas', entry[0]);
    action.take(); action.accept('COLUMN');
    addDefinition(table, entry.slice(action.index));
  }
  return table;
}

function clauseIndex(tokens, keyword, start = 0) {
  let depth = 0;
  let cases = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const current = word(tokens[index]);
    if (current === '(') depth += 1;
    else if (current === ')') depth -= 1;
    else if (!depth && current === 'CASE') cases += 1;
    else if (!depth && current === 'END') cases -= 1;
    if (!depth && !cases && current === keyword) return index;
  }
  return -1;
}

const sourceKeywords = new Set(['JOIN', 'INNER', 'LEFT', 'RIGHT', 'CROSS', 'ON', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'SET', ',', ')']);

function parseSource(cursor) {
  let result;
  if (cursor.peek() === '(') result = { query: parseSelect(cursor.group()) };
  else result = { table: cursor.name() };
  if (cursor.accept('AS') || (cursor.tokens[cursor.index]?.kind === 'word' && !sourceKeywords.has(cursor.peek()))) result.alias = cursor.take().value.toLowerCase();
  else result.alias = result.table;
  if (!result.alias) throw new SqlError('derived table needs alias', cursor.tokens[cursor.index]);
  return result;
}

function parseFrom(tokens) {
  const cursor = new Cursor(tokens);
  const sources = [{ ...parseSource(cursor), join: 'CROSS', condition: null }];
  while (cursor.index < tokens.length) {
    let join = 'INNER';
    if (cursor.accept(',')) join = 'CROSS';
    else {
      if (['LEFT', 'CROSS', 'INNER'].includes(cursor.peek())) join = cursor.take().value.toUpperCase();
      cursor.accept('OUTER'); cursor.expect('JOIN');
    }
    const source = parseSource(cursor);
    const condition = cursor.accept('ON') ? parseExpression(cursor) : null;
    if (join !== 'CROSS' && !condition) throw new SqlError('join is missing ON', tokens[0]);
    sources.push({ ...source, join, condition });
  }
  return sources;
}

export function parseSelect(tokens) {
  const unionIndex = clauseIndex(tokens, 'UNION');
  if (unionIndex >= 0) {
    const all = word(tokens[unionIndex + 1]) === 'ALL';
    return { type: 'union', all, left: parseSelect(tokens.slice(0, unionIndex)), right: parseSelect(tokens.slice(unionIndex + (all ? 2 : 1))), token: tokens[0] };
  }
  const cursor = new Cursor(tokens);
  cursor.expect('SELECT');
  const distinct = cursor.accept('DISTINCT');
  const clauses = ['FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT'].map(name => ({ name, index: clauseIndex(tokens, name, cursor.index) })).filter(entry => entry.index >= 0).sort((left, right) => left.index - right.index);
  const projectionEnd = clauses[0]?.index ?? tokens.length;
  const columns = splitTop(tokens.slice(cursor.index, projectionEnd)).map((part, index) => {
    const columnCursor = new Cursor(part);
    const value = parseExpression(columnCursor);
    let alias = value.type === 'reference' ? value.parts.at(-1) : `column_${index}`;
    if (columnCursor.accept('AS') || columnCursor.index < part.length) alias = columnCursor.take().value.toLowerCase();
    columnCursor.done();
    return { alias, expression: value };
  });
  const aliases = new Set();
  for (let index = 0; index < columns.length; index += 1) {
    if (aliases.has(columns[index].alias)) columns[index].alias = `column_${index}`;
    aliases.add(columns[index].alias);
  }
  const query = { type: 'select', columns, distinct, sources: [], where: null, group: [], having: null, order: [], limit: null, token: tokens[0] };
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    const body = tokens.slice(clause.index + 1, clauses[index + 1]?.index ?? tokens.length);
    if (clause.name === 'FROM') query.sources = parseFrom(body);
    else if (clause.name === 'WHERE') query.where = expression(body);
    else if (clause.name === 'HAVING') query.having = expression(body);
    else if (clause.name === 'GROUP') { if (word(body[0]) !== 'BY') throw new SqlError('GROUP needs BY', body[0]); query.group = splitTop(body.slice(1)).map(expression); }
    else if (clause.name === 'ORDER') {
      if (word(body[0]) !== 'BY') throw new SqlError('ORDER needs BY', body[0]);
      query.order = splitTop(body.slice(1)).map(part => {
        const direction = ['ASC', 'DESC'].includes(word(part.at(-1))) ? word(part.at(-1)) : 'ASC';
        return { expression: expression(['ASC', 'DESC'].includes(word(part.at(-1))) ? part.slice(0, -1) : part), direction };
      });
    } else if (clause.name === 'LIMIT') query.limit = splitTop(body).map(expression);
  }
  return query;
}

export function targetTable(tokens) {
  const cursor = new Cursor(tokens);
  const operation = cursor.take().value.toUpperCase();
  if (operation === 'INSERT' || operation === 'REPLACE') { cursor.accept('IGNORE'); cursor.accept('INTO'); return cursor.name(); }
  if (operation === 'UPDATE') { cursor.accept('IGNORE'); return cursor.name(); }
  if (operation === 'DELETE') {
    const from = tokens.findIndex(entry => word(entry) === 'FROM');
    if (from < 0) throw new SqlError('DELETE has no FROM', tokens[0]);
    cursor.index = from + 1; return cursor.name();
  }
  if (['CREATE', 'DROP', 'TRUNCATE', 'ALTER'].includes(operation)) {
    cursor.accept('TEMPORARY');
    if (!cursor.accept('TABLE')) return null;
    if (cursor.accept('IF')) { cursor.accept('NOT'); cursor.expect('EXISTS'); }
    return cursor.name();
  }
  return null;
}

export function parseInsert(tokens, schema) {
  const cursor = new Cursor(tokens);
  const operation = cursor.take().value.toUpperCase();
  const ignore = cursor.accept('IGNORE');
  cursor.accept('INTO');
  const table = cursor.name();
  const columns = cursor.peek() === '(' ? splitTop(cursor.group()).map(part => {
    if (part.length !== 1 || part[0].kind !== 'word') throw new SqlError('invalid INSERT column', part[0]);
    return part[0].value.toLowerCase();
  }) : [...(schema?.columns.keys() ?? [])];
  if (!columns.length) throw new SqlError(`unknown column order for ${table}`, tokens[0]);
  if (new Set(columns).size !== columns.length) throw new SqlError('duplicate INSERT column', tokens[0]);
  for (const column of columns) if (schema && !schema.columns.has(column)) throw new SqlError(`${table}.${column} does not exist`, tokens[0]);
  let tailIndex = clauseIndex(tokens, 'ON', cursor.index);
  while (tailIndex >= 0 && word(tokens[tailIndex + 1]) !== 'DUPLICATE') tailIndex = clauseIndex(tokens, 'ON', tailIndex + 1);
  const end = tailIndex < 0 ? tokens.length : tailIndex;
  const body = tokens.slice(cursor.index, end);
  let rows = null;
  let query = null;
  if (['VALUES', 'VALUE'].includes(word(body[0]))) {
    const values = new Cursor(body.slice(1));
    rows = [];
    do {
      const entries = splitTop(values.group()).map(expression);
      if (entries.length !== columns.length) throw new SqlError(`${table}: ${columns.length} columns but ${entries.length} values`, body[0]);
      rows.push(entries);
    } while (values.accept(','));
    values.done();
  } else if (word(body[0]) === 'SELECT') query = parseSelect(body);
  else throw new SqlError('unsupported INSERT body', body[0]);
  const updates = tailIndex < 0 ? [] : parseAssignments(tokens.slice(tailIndex + 4));
  if (tailIndex >= 0 && tokens.slice(tailIndex, tailIndex + 4).map(word).join(' ') !== 'ON DUPLICATE KEY UPDATE') throw new SqlError('unsupported INSERT suffix', tokens[tailIndex]);
  return { operation, table, columns, ignore, rows, query, updates, token: tokens[0] };
}

function parseAssignments(tokens) {
  return splitTop(tokens).map(part => {
    const cursor = new Cursor(part);
    const name = cursor.name();
    cursor.expect('=');
    const value = parseExpression(cursor);
    cursor.done();
    return { name, expression: value };
  });
}

const aggregateNames = new Set(['COUNT', 'SUM', 'MAX', 'MIN', 'AVG']);
function containsAggregate(node) {
  if (!node || typeof node !== 'object' || node instanceof Decimal) return false;
  if (node.type === 'call' && aggregateNames.has(node.name)) return true;
  if (['scalar', 'exists'].includes(node.type)) return false;
  return Object.entries(node).some(([key, value]) => key !== 'token' && (Array.isArray(value) ? value.some(containsAggregate) : containsAggregate(value)));
}

export class MemorySql {
  constructor(schemas, options = {}) {
    this.schemas = new Map(schemas);
    this.tables = new Map([...schemas].map(([name]) => [name, []]));
    this.nextIds = new Map();
    this.variables = new Map();
    this.writes = [];
    this.options = options;
    this.now = '2026-09-14 12:00:00';
  }

  clone() {
    const result = new MemorySql(this.schemas, this.options);
    result.tables = new Map([...this.tables].map(([name, rows]) => [name, rows.map(row => {
      const copy = { ...row };
      Object.defineProperty(copy, '$origin', { value: row.$origin, enumerable: false });
      return copy;
    })]));
    result.nextIds = new Map(this.nextIds);
    result.variables = new Map(this.variables);
    return result;
  }

  rows(name) {
    if (!this.tables.has(name)) throw new Error(`unmodelled SQL source table: ${name}`);
    return this.tables.get(name);
  }

  lookup(parts, environment, token) {
    if (parts.length > 1) {
      const row = environment[parts.at(-2)];
      if (!row || !(parts.at(-1) in row)) throw new SqlError(`unresolved reference ${parts.join('.')}`, token);
      return row[parts.at(-1)];
    }
    if (parts[0] === 'current_timestamp') return this.now;
    const candidates = Object.values(environment).filter(row => row && parts[0] in row);
    if (!candidates.length) throw new SqlError(`unresolved reference ${parts[0]}`, token);
    return candidates[0][parts[0]];
  }

  evaluate(node, environment = {}, group = null) {
    if (!node) return true;
    const evaluate = child => this.evaluate(child, environment, group);
    if (node.type === 'literal') return node.value;
    if (node.type === 'tuple') return node.entries.map(evaluate);
    if (node.type === 'reference') return this.lookup(node.parts, environment, node.token);
    if (node.type === 'variable') {
      if (!this.variables.has(node.name)) throw new SqlError(`unresolved variable @${node.name}`, node.token);
      return this.variables.get(node.name);
    }
    if (node.type === 'star') return true;
    if (node.type === 'unary') {
      const value = evaluate(node.operand);
      if (value === null) return null;
      return node.operator === 'NOT' ? !truth(value) : Decimal.from(value).multiply(node.operator === '-' ? -1 : 1);
    }
    if (node.type === 'is') {
      const value = evaluate(node.operand);
      const result = node.target === 'NULL' ? value === null : value !== null && truth(value) === (node.target === 'TRUE');
      return node.negate ? !result : result;
    }
    if (node.type === 'exists') return this.select(node.query, environment).length > 0;
    if (node.type === 'scalar') {
      const rows = this.select(node.query, environment);
      if (rows.length > 1) throw new SqlError('scalar subquery returned multiple rows', node.token);
      return rows.length ? Object.values(rows[0])[0] : null;
    }
    if (node.type === 'case') {
      const base = node.base ? evaluate(node.base) : null;
      for (const branch of node.branches) {
        const condition = evaluate(branch.condition);
        if (node.base ? base !== null && condition !== null && compare(base, condition) === 0 : truth(condition)) return evaluate(branch.value);
      }
      return evaluate(node.fallback);
    }
    if (node.type === 'interval') return { amount: numeric(evaluate(node.amount)), unit: node.unit };
    if (node.type === 'cast') {
      const value = evaluate(node.operand);
      if (value === null) return null;
      if (['CHAR', 'VARCHAR'].includes(node.castType)) return String(value);
      if (['SIGNED', 'UNSIGNED', 'DECIMAL'].includes(node.castType)) return Decimal.from(value);
      throw new SqlError(`unsupported CAST ${node.castType}`, node.token);
    }
    if (node.type === 'in') {
      const value = evaluate(node.operand);
      const entries = Array.isArray(node.entries) ? node.entries.map(evaluate) : this.select(node.entries, environment).map(row => Object.values(row)[0]);
      const matched = value !== null && entries.some(entry => entry !== null && compare(value, entry) === 0);
      const result = matched ? true : value === null || entries.includes(null) ? null : false;
      return result === null ? null : node.negate ? !result : result;
    }
    if (node.type === 'between') {
      const value = evaluate(node.operand);
      const lower = evaluate(node.lower);
      const upper = evaluate(node.upper);
      if ([value, lower, upper].includes(null)) return null;
      const result = compare(value, lower) >= 0 && compare(value, upper) <= 0;
      return node.negate ? !result : result;
    }
    if (node.type === 'binary') {
      const left = evaluate(node.left);
      if (node.operator === 'AND' && left !== null && !truth(left)) return false;
      if (node.operator === 'OR' && truth(left)) return true;
      const right = evaluate(node.right);
      if (node.operator === 'AND') return right !== null && !truth(right) ? false : left === null || right === null ? null : true;
      if (node.operator === 'OR') return truth(right) ? true : left === null || right === null ? null : false;
      if (node.operator === '<=>') return left === null || right === null ? left === right : compare(left, right) === 0;
      if (left === null || right === null) return null;
      if (node.operator === 'LIKE') {
        const pattern = String(right).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
        const result = new RegExp(`^${pattern}$`, 's').test(String(left));
        return node.negate ? !result : result;
      }
      if (['=', '<>', '!=', '>', '<', '>=', '<='].includes(node.operator)) {
        const comparison = compare(left, right);
        return ({ '=': comparison === 0, '<>': comparison !== 0, '!=': comparison !== 0, '>': comparison > 0, '<': comparison < 0, '>=': comparison >= 0, '<=': comparison <= 0 })[node.operator];
      }
      const leftNumber = Decimal.from(left);
      const rightNumber = Decimal.from(right);
      if (node.operator === '+') return leftNumber.add(rightNumber);
      if (node.operator === '-') return leftNumber.subtract(rightNumber);
      if (node.operator === '*') return leftNumber.multiply(rightNumber);
      if (node.operator === '/') return rightNumber.numerator === 0n ? null : leftNumber.divide(rightNumber);
      if (['%', 'MOD', 'DIV'].includes(node.operator)) {
        const quotient = leftNumber.divide(rightNumber);
        const integer = new Decimal(quotient.numerator / quotient.denominator);
        return node.operator === 'DIV' ? integer : leftNumber.subtract(rightNumber.multiply(integer));
      }
      throw new SqlError(`unsupported operator ${node.operator}`, node.token);
    }
    if (node.type !== 'call') throw new SqlError(`unsupported expression type ${node.type}`, node.token);
    if (aggregateNames.has(node.name)) {
      if (!group) throw new SqlError('aggregate outside grouped SELECT', node.token);
      const values = group.map(row => this.evaluate(node.arguments[0], row)).filter(value => value !== null);
      if (node.name === 'COUNT') return Decimal.from(values.length);
      if (!values.length) return null;
      if (node.name === 'SUM' || node.name === 'AVG') {
        const sum = values.reduce((total, value) => total.add(value), Decimal.from(0));
        return node.name === 'AVG' ? sum.divide(values.length) : sum;
      }
      return values.reduce((selected, value) => (compare(value, selected) > 0) === (node.name === 'MAX') ? value : selected);
    }
    if (node.name === 'IF') return evaluate(node.arguments[truth(evaluate(node.arguments[0])) ? 1 : 2]);
    if (['COALESCE', 'IFNULL'].includes(node.name)) {
      for (const argument of node.arguments) { const value = evaluate(argument); if (value !== null) return value; }
      return null;
    }
    if (node.name === 'VALUES') return this.lookup(node.arguments[0].parts, { incoming: environment.incoming }, node.token);
    const values = node.arguments.map(evaluate);
    if (['NOW', 'CURRENT_TIMESTAMP'].includes(node.name)) return this.now;
    if (['CURDATE', 'CURRENT_DATE'].includes(node.name)) return this.now.slice(0, 10);
    if (node.name === 'CONCAT') return values.includes(null) ? null : values.map(String).join('');
    if (node.name === 'CONCAT_WS') return values[0] === null ? null : values.slice(1).filter(value => value !== null).map(String).join(String(values[0]));
    if (node.name === 'SHA2') { if (numeric(values[1]) !== 256) throw new SqlError('only SHA2/256 is modelled', node.token); return createHash('sha256').update(String(values[0])).digest('hex'); }
    if (node.name === 'MD5') return createHash('md5').update(String(values[0])).digest('hex');
    if (node.name === 'ROUND') return values[0] === null ? null : Decimal.from(values[0]).round(numeric(values[1] ?? 0));
    if (node.name === 'ABS') return values[0] === null ? null : Decimal.from(values[0]).multiply(Decimal.from(values[0]).numerator < 0n ? -1 : 1);
    if (node.name === 'FLOOR' || node.name === 'CEIL' || node.name === 'CEILING') {
      const value = Decimal.from(values[0]);
      let integer = value.numerator / value.denominator;
      if (value.numerator % value.denominator !== 0n && (node.name === 'FLOOR' ? value.numerator < 0n : value.numerator > 0n)) integer += node.name === 'FLOOR' ? -1n : 1n;
      return new Decimal(integer);
    }
    if (node.name === 'JSON_OBJECT') {
      const object = {};
      for (let index = 0; index < values.length; index += 2) object[String(values[index])] = values[index + 1];
      return stable(object);
    }
    if (node.name === 'JSON_ARRAY') return stable(values);
    if (node.name === 'ELT') return values[numeric(values[0])] ?? null;
    if (node.name === 'MOD') {
      const dividend = Decimal.from(values[0]);
      const divisor = Decimal.from(values[1]);
      const quotient = dividend.divide(divisor);
      return dividend.subtract(divisor.multiply(new Decimal(quotient.numerator / quotient.denominator)));
    }
    if (node.name === 'LEFT') return String(values[0]).slice(0, numeric(values[1]));
    if (node.name === 'RIGHT') return String(values[0]).slice(-numeric(values[1]));
    if (node.name === 'TIMESTAMP') return values.length === 1 ? String(values[0]).padEnd(19, ' 00:00:00') : `${String(values[0]).slice(0, 10)} ${values[1]}`;
    if (['LOWER', 'UPPER', 'TRIM'].includes(node.name)) return values[0] === null ? null : node.name === 'LOWER' ? String(values[0]).toLowerCase() : node.name === 'UPPER' ? String(values[0]).toUpperCase() : String(values[0]).trim();
    if (['LPAD', 'RPAD'].includes(node.name)) return node.name === 'LPAD' ? String(values[0]).padStart(numeric(values[1]), String(values[2])) : String(values[0]).padEnd(numeric(values[1]), String(values[2]));
    if (['DATE_ADD', 'DATE_SUB'].includes(node.name)) {
      const base = new Date(`${String(values[0]).replace(' ', 'T')}${String(values[0]).length === 10 ? 'T00:00:00' : ''}Z`);
      const interval = values[1];
      const count = interval.amount * (node.name === 'DATE_SUB' ? -1 : 1);
      if (interval.unit === 'DAY') base.setUTCDate(base.getUTCDate() + count);
      else if (interval.unit === 'MONTH') base.setUTCMonth(base.getUTCMonth() + count);
      else if (interval.unit === 'YEAR') base.setUTCFullYear(base.getUTCFullYear() + count);
      else if (interval.unit === 'HOUR') base.setUTCHours(base.getUTCHours() + count);
      else if (interval.unit === 'MINUTE') base.setUTCMinutes(base.getUTCMinutes() + count);
      else if (interval.unit === 'SECOND') base.setUTCSeconds(base.getUTCSeconds() + count);
      else throw new SqlError(`unsupported interval ${interval.unit}`, node.token);
      return base.toISOString().slice(0, String(values[0]).length === 10 ? 10 : 19).replace('T', ' ');
    }
    if (node.name === 'DATE') return String(values[0]).slice(0, 10);
    if (node.name === 'YEAR') return Decimal.from(String(values[0]).slice(0, 4));
    if (node.name === 'MONTH') return Decimal.from(String(values[0]).slice(5, 7));
    if (node.name === 'DATE_FORMAT') {
      const source = String(values[0]);
      return String(values[1]).replace(/%Y/g, source.slice(0, 4)).replace(/%m/g, source.slice(5, 7)).replace(/%d/g, source.slice(8, 10));
    }
    if (node.name === 'NULLIF') return values[0] !== null && values[1] !== null && compare(values[0], values[1]) === 0 ? null : values[0];
    if (node.name === 'GREATEST' || node.name === 'LEAST') return values.includes(null) ? null : values.reduce((selected, value) => (compare(value, selected) > 0) === (node.name === 'GREATEST') ? value : selected);
    throw new SqlError(`unsupported function ${node.name}`, node.token);
  }

  environments(sources, outer = {}) {
    let environments = [outer];
    for (const source of sources) {
      const rows = source.query ? this.select(source.query, outer) : this.rows(source.table);
      const nullRow = Object.fromEntries((source.query ? Object.keys(rows[0] ?? {}) : [...this.schemas.get(source.table).columns.keys()]).map(name => [name, null]));
      const next = [];
      for (const environment of environments) {
        let matched = false;
        for (const row of rows) {
          const candidate = { ...environment, [source.alias]: row };
          if (truth(this.evaluate(source.condition, candidate))) { next.push(candidate); matched = true; }
        }
        if (!matched && source.join === 'LEFT') next.push({ ...environment, [source.alias]: nullRow });
      }
      environments = next;
    }
    return environments;
  }

  select(query, outer = {}) {
    if (query.type === 'union') {
      const leftRows = this.select(query.left, outer);
      let first = query.left;
      while (first.type === 'union') first = first.left;
      const aliases = first.columns.map(column => column.alias);
      const rightRows = this.select(query.right, outer).map(row => {
        const values = Object.values(row);
        if (values.length !== aliases.length) throw new SqlError('UNION projection arity differs', query.token);
        return Object.fromEntries(values.map((value, index) => [aliases[index], value]));
      });
      const combined = [...leftRows, ...rightRows];
      return query.all ? combined : [...new Map(combined.map(row => [stable(row), row])).values()];
    }
    const selected = this.environments(query.sources, outer).filter(environment => truth(this.evaluate(query.where, environment)));
    const aggregate = query.columns.some(column => containsAggregate(column.expression)) || containsAggregate(query.having);
    const groups = new Map();
    if (query.group.length) {
      for (const environment of selected) {
        const key = stable(query.group.map(entry => this.evaluate(entry, environment)));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(environment);
      }
    } else if (aggregate) groups.set('aggregate', selected);
    else selected.forEach((environment, index) => groups.set(index, [environment]));
    let results = [];
    for (const group of groups.values()) {
      const environment = group[0] ?? outer;
      const output = {};
      for (const column of query.columns) {
        if (column.expression.type === 'star') Object.assign(output, ...Object.values(environment));
        else output[column.alias] = this.evaluate(column.expression, environment, group);
      }
      if (!truth(this.evaluate(query.having, { output, ...environment }, group))) continue;
      results.push({ output, environment, group });
    }
    if (query.order.length) results.sort((left, right) => {
      for (const order of query.order) {
        const leftValue = this.evaluate(order.expression, { output: left.output, ...left.environment }, left.group);
        const rightValue = this.evaluate(order.expression, { output: right.output, ...right.environment }, right.group);
        const compared = leftValue === null ? rightValue === null ? 0 : -1 : rightValue === null ? 1 : compare(leftValue, rightValue);
        if (compared) return compared * (order.direction === 'DESC' ? -1 : 1);
      }
      return 0;
    });
    let rows = results.map(entry => entry.output);
    if (query.distinct) rows = [...new Map(rows.map(row => [stable(row), row])).values()];
    if (query.limit) {
      const limits = query.limit.map(entry => numeric(this.evaluate(entry, outer)));
      rows = limits.length === 1 ? rows.slice(0, limits[0]) : rows.slice(limits[0], limits[0] + limits[1]);
    }
    return rows;
  }

  validateRow(schema, row, token) {
    for (const column of schema.columns.values()) if (!column.nullable && row[column.name] === null) throw new SqlError(`NOT NULL ${schema.name}.${column.name} rejected row`, token);
    if (this.options.enforceChecks !== false) {
      for (const check of schema.checks.values()) {
        const result = this.evaluate(check.expression, { [schema.name]: row });
        if (result !== null && !truth(result)) throw new SqlError(`CHECK ${schema.name}.${check.name} rejected row`, token);
      }
    }
  }

  insert(parsed) {
    const schema = this.schemas.get(parsed.table);
    if (!schema) throw new SqlError(`no schema for ${parsed.table}`, parsed.token);
    if (parsed.columns.some(name => schema.columns.get(name)?.generated)) throw new SqlError('seed cannot write generated columns', parsed.token);
    const inputs = parsed.rows ? parsed.rows.map(row => row.map(entry => this.evaluate(entry))) : this.select(parsed.query).map(row => Object.values(row));
    const inserted = [];
    for (const values of inputs) {
      if (values.length !== parsed.columns.length) throw new SqlError(`${parsed.table}: SELECT projection arity differs from INSERT columns`, parsed.token);
      const row = Object.fromEntries(parsed.columns.map((name, index) => [name, values[index]]));
      for (const column of schema.columns.values()) {
        if (!(column.name in row)) row[column.name] = column.default ? this.evaluate(column.default) : null;
        if (column.autoIncrement) {
          const counterKey = `${schema.name}.${column.name}`;
          const nextId = this.nextIds.get(counterKey) ?? BigInt(schema.options.AUTO_INCREMENT ?? 1);
          if (row[column.name] === null) row[column.name] = new Decimal(nextId);
          const supplied = Decimal.from(row[column.name]);
          this.nextIds.set(counterKey, supplied.numerator >= nextId ? supplied.numerator + 1n : nextId);
        }
      }
      for (const column of schema.columns.values()) if (column.generated) row[column.name] = this.evaluate(column.generated, { [schema.name]: row });
      const duplicate = this.rows(parsed.table).find(existing => [...schema.indexes.values()].some(index => index.unique && index.columns.every(column => row[column.name] !== null && existing[column.name] !== null && compare(row[column.name], existing[column.name]) === 0)));
      this.writes.push({ table: parsed.table, operation: 'INSERT', row: { ...row }, duplicate: Boolean(duplicate), ignore: parsed.ignore, token: parsed.token });
      if (duplicate) {
        if (parsed.updates.length) {
          if ([...schema.columns.values()].some(column => column.generated)) throw new SqlError('seed cannot upsert a table with generated columns', parsed.token);
          for (const assignment of parsed.updates) duplicate[assignment.name] = this.evaluate(assignment.expression, { [parsed.table]: duplicate, incoming: row });
          this.validateRow(schema, duplicate, parsed.token);
          continue;
        }
        if (parsed.ignore) continue;
        if (parsed.operation === 'REPLACE') this.tables.set(parsed.table, this.rows(parsed.table).filter(existing => existing !== duplicate));
        else throw new SqlError(`duplicate key in ${parsed.table}`, parsed.token);
      }
      this.validateRow(schema, row, parsed.token);
      Object.defineProperty(row, '$origin', { value: parsed.token, enumerable: false, configurable: true });
      this.rows(parsed.table).push(row);
      inserted.push(row);
    }
    return inserted;
  }

  execute(tokens) {
    const operation = word(tokens[0]);
    const name = targetTable(tokens);
    if (operation === 'CREATE') {
      const schema = parseCreate(tokens);
      if (!schema.temporary) throw new SqlError('seed cannot create permanent tables', tokens[0]);
      if (this.tables.has(schema.name)) throw new SqlError(`temporary table already exists: ${schema.name}`, tokens[0]);
      this.schemas.set(schema.name, schema); this.tables.set(schema.name, []); return;
    }
    if (operation === 'DROP') {
      if (this.schemas.get(name)?.temporary) { this.schemas.delete(name); this.tables.delete(name); return; }
      if (!this.tables.has(name)) return;
      throw new SqlError('seed cannot drop permanent tables', tokens[0]);
    }
    if (operation === 'INSERT' || operation === 'REPLACE') return this.insert(parseInsert(tokens, this.schemas.get(name)));
    if (operation === 'TRUNCATE') { this.tables.set(name, []); return; }
    if (operation === 'SET') {
      const cursor = new Cursor(tokens.slice(1));
      if (!cursor.accept('@')) return;
      const variable = cursor.take().value.toLowerCase();
      if (!cursor.accept('=')) cursor.expect(':=');
      this.variables.set(variable, this.evaluate(expression(cursor.tokens.slice(cursor.index))));
      return;
    }
    if (operation === 'UPDATE' || operation === 'DELETE') {
      const setIndex = clauseIndex(tokens, 'SET');
      const whereIndex = clauseIndex(tokens, 'WHERE');
      const fromIndex = operation === 'UPDATE' ? 1 : tokens.findIndex(entry => word(entry) === 'FROM') + 1;
      const end = operation === 'UPDATE' ? setIndex : whereIndex < 0 ? tokens.length : whereIndex;
      const sources = parseFrom(tokens.slice(fromIndex, end));
      const condition = whereIndex < 0 ? null : expression(tokens.slice(whereIndex + 1));
      const selected = this.environments(sources).filter(environment => truth(this.evaluate(condition, environment)));
      const changed = new Set();
      const assignments = operation === 'UPDATE' ? parseAssignments(tokens.slice(setIndex + 1, whereIndex < 0 ? tokens.length : whereIndex)) : [];
      for (const environment of selected) {
        const row = environment[sources[0].alias];
        if (changed.has(row)) continue;
        changed.add(row);
        if (operation === 'UPDATE') {
          if ([...this.schemas.get(name).columns.values()].some(column => column.generated)) throw new SqlError('seed cannot update a table with generated columns', tokens[0]);
          for (const assignment of assignments) {
            if (!this.schemas.get(name).columns.has(assignment.name)) throw new SqlError(`unknown UPDATE column ${name}.${assignment.name}`, tokens[0]);
            row[assignment.name] = this.evaluate(assignment.expression, environment);
          }
          this.validateRow(this.schemas.get(name), row, tokens[0]);
        }
        this.writes.push({ table: name, operation, row: { ...row }, token: tokens[0] });
      }
      if (operation === 'DELETE') this.tables.set(name, this.rows(name).filter(row => !changed.has(row)));
      return;
    }
    throw new SqlError(`unsupported statement ${operation}`, tokens[0]);
  }
}
