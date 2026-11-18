// Pure TypeScript SQL Tokenizer, Formatter, Beautifier, Minifier, and Validator
// Zero external dependencies — executes 100% locally in the browser.

export type SqlDialect = 'ansi' | 'postgresql' | 'mysql' | 'sqlite' | 'tsql' | 'oracle';

export type SqlKeywordCase = 'upper' | 'lower' | 'preserve';

export interface SqlFormatOptions {
  dialect?: SqlDialect;
  indent?: '2' | '4' | 'tab';
  keywordCase?: SqlKeywordCase;
  commaPosition?: 'trailing' | 'leading';
  linesBetweenQueries?: number;
  alignClauses?: boolean;
  stripComments?: boolean;
}

export interface SqlMinifyOptions {
  dialect?: SqlDialect;
  stripComments?: boolean;
}

export interface SqlDiagnostic {
  severity: 'error' | 'warning' | 'info';
  line: number;
  column: number;
  message: string;
  code: string;
}

export interface SqlStatementSummary {
  index: number;
  type: string;
  startLine: number;
  endLine: number;
  tables: string[];
  hasWhere: boolean;
  preview: string;
}

export interface SqlValidationResult {
  valid: boolean;
  errors: SqlDiagnostic[];
  warnings: SqlDiagnostic[];
  infos: SqlDiagnostic[];
  statements: SqlStatementSummary[];
  tokenCount: number;
}

type TokenType =
  | 'word'
  | 'string'
  | 'quoted_ident'
  | 'number'
  | 'line_comment'
  | 'block_comment'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'semicolon'
  | 'dot'
  | 'operator'
  | 'whitespace';

interface Token {
  type: TokenType;
  value: string;
  upper: string;
  line: number;
  col: number;
}

export const SQL_DIALECTS: { id: SqlDialect; label: string }[] = [
  { id: 'ansi', label: 'Standard SQL (ANSI)' },
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL / MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'tsql', label: 'SQL Server (T-SQL)' },
  { id: 'oracle', label: 'Oracle (PL/SQL)' },
];

export const SQL_KEYWORDS = new Set([
  'SELECT', 'DISTINCT', 'ALL', 'TOP', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
  'TRUE', 'FALSE', 'AS', 'ON', 'USING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER',
  'CROSS', 'NATURAL', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
  'LIMIT', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY', 'UNION', 'INTERSECT', 'EXCEPT',
  'INSERT', 'INTO', 'VALUES', 'DEFAULT', 'UPDATE', 'SET', 'DELETE', 'MERGE', 'MATCHED',
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'TABLE', 'VIEW', 'INDEX', 'UNIQUE', 'DATABASE',
  'SCHEMA', 'SEQUENCE', 'TRIGGER', 'FUNCTION', 'PROCEDURE', 'REPLACE', 'TEMP', 'TEMPORARY',
  'IF', 'EXISTS', 'CASCADE', 'RESTRICT', 'ADD', 'COLUMN', 'CONSTRAINT', 'PRIMARY', 'FOREIGN',
  'KEY', 'REFERENCES', 'CHECK', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'SERIAL', 'BIGSERIAL',
  'IDENTITY', 'WITH', 'RECURSIVE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'BETWEEN', 'LIKE',
  'ILIKE', 'SIMILAR', 'TO', 'ESCAPE', 'CAST', 'COALESCE', 'NULLIF', 'OVER', 'PARTITION',
  'WINDOW', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW', 'FILTER',
  'RETURNING', 'CONFLICT', 'DO', 'NOTHING', 'DUPLICATE', 'BEGIN', 'COMMIT', 'ROLLBACK',
  'TRANSACTION', 'SAVEPOINT', 'GRANT', 'REVOKE', 'EXPLAIN', 'ANALYZE', 'VACUUM', 'PRAGMA',
  'USE', 'SHOW', 'DESCRIBE', 'DESC', 'CALL', 'EXEC', 'EXECUTE', 'DECLARE', 'CURSOR',
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE',
  'REAL', 'BOOLEAN', 'BOOL', 'CHAR', 'VARCHAR', 'NVARCHAR', 'TEXT', 'CLOB', 'BLOB', 'BYTEA',
  'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL', 'JSON', 'JSONB', 'UUID', 'XML',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'NOW', 'CURRENT_TIMESTAMP', 'CURRENT_DATE',
]);

const MAJOR_CLAUSES = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'FETCH',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE FROM', 'RETURNING', 'ON CONFLICT', 'WITH', 'WITH RECURSIVE', 'WINDOW',
  'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'NATURAL JOIN',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'JOIN',
]);

const CLAUSE_LABEL_WIDTH = 15;

export function tokenizeSql(sql: string, dialect: SqlDialect = 'ansi'): { tokens: Token[]; lexErrors: SqlDiagnostic[] } {
  const tokens: Token[] = [];
  const lexErrors: SqlDiagnostic[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = sql.length;

  const advance = (count = 1) => {
    for (let k = 0; k < count; k++) {
      if (sql[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < n) {
    const ch = sql[i];
    const startLine = line;
    const startCol = col;

    // Whitespace
    if (/\s/.test(ch)) {
      let val = '';
      while (i < n && /\s/.test(sql[i])) {
        val += sql[i];
        advance();
      }
      tokens.push({ type: 'whitespace', value: val, upper: val, line: startLine, col: startCol });
      continue;
    }

    // Line comment: -- ...
    if (ch === '-' && sql[i + 1] === '-') {
      let val = '';
      while (i < n && sql[i] !== '\n') {
        val += sql[i];
        advance();
      }
      tokens.push({ type: 'line_comment', value: val, upper: val, line: startLine, col: startCol });
      continue;
    }

    // MySQL # line comment
    if (ch === '#' && dialect === 'mysql') {
      let val = '';
      while (i < n && sql[i] !== '\n') {
        val += sql[i];
        advance();
      }
      tokens.push({ type: 'line_comment', value: val, upper: val, line: startLine, col: startCol });
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && sql[i + 1] === '*') {
      let val = '/*';
      advance(2);
      let closed = false;
      while (i < n) {
        if (sql[i] === '*' && sql[i + 1] === '/') {
          val += '*/';
          advance(2);
          closed = true;
          break;
        }
        val += sql[i];
        advance();
      }
      if (!closed) {
        lexErrors.push({
          severity: 'error',
          line: startLine,
          column: startCol,
          code: 'UNCLOSED_COMMENT',
          message: 'Unclosed block comment /* ... */.',
        });
      }
      tokens.push({ type: 'block_comment', value: val, upper: val, line: startLine, col: startCol });
      continue;
    }

    // Single-quoted string literal
    if (ch === "'") {
      let val = "'";
      advance();
      let closed = false;
      while (i < n) {
        if (sql[i] === '\\' && dialect === 'mysql' && i + 1 < n) {
          val += sql[i] + sql[i + 1];
          advance(2);
          continue;
        }
        if (sql[i] === "'") {
          val += "'";
          advance();
          if (sql[i] === "'") {
            val += "'";
            advance();
            continue;
          }
          closed = true;
          break;
        }
        val += sql[i];
        advance();
      }
      if (!closed) {
        lexErrors.push({
          severity: 'error',
          line: startLine,
          column: startCol,
          code: 'UNCLOSED_STRING',
          message: "Unclosed single-quoted string literal (').",
        });
      }
      tokens.push({ type: 'string', value: val, upper: val, line: startLine, col: startCol });
      continue;
    }

    // PostgreSQL dollar-quoted string: $$...$$ or $tag$...$tag$
    if (ch === '$' && (dialect === 'postgresql' || dialect === 'ansi')) {
      const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        const tag = m[0];
        let val = tag;
        advance(tag.length);
        const endIdx = sql.indexOf(tag, i);
        if (endIdx === -1) {
          val += sql.slice(i);
          advance(n - i);
          lexErrors.push({
            severity: 'error',
            line: startLine,
            column: startCol,
            code: 'UNCLOSED_DOLLAR_STRING',
            message: `Unclosed PostgreSQL dollar-quoted string (${tag}).`,
          });
        } else {
          const innerLen = endIdx - i + tag.length;
          val += sql.slice(i, endIdx + tag.length);
          advance(innerLen);
        }
        tokens.push({ type: 'string', value: val, upper: val, line: startLine, col: startCol });
        continue;
      }
    }

    // Double-quoted or backtick identifier
    if (ch === '"' || ch === '`') {
      const quote = ch;
      let val = quote;
      advance();
      let closed = false;
      while (i < n) {
        if (sql[i] === quote) {
          val += quote;
          advance();
          if (sql[i] === quote) {
            val += quote;
            advance();
            continue;
          }
          closed = true;
          break;
        }
        val += sql[i];
        advance();
      }
      if (!closed) {
        lexErrors.push({
          severity: 'error',
          line: startLine,
          column: startCol,
          code: 'UNCLOSED_IDENTIFIER',
          message: `Unclosed quoted identifier (${quote}).`,
        });
      }
      tokens.push({ type: 'quoted_ident', value: val, upper: val, line: startLine, col: startCol });
      continue;
    }

    // T-SQL bracket identifier [column name]
    if (ch === '[' && dialect === 'tsql') {
      let val = '[';
      advance();
      let closed = false;
      while (i < n) {
        val += sql[i];
        if (sql[i] === ']') {
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        lexErrors.push({
          severity: 'error',
          line: startLine,
          column: startCol,
          code: 'UNCLOSED_BRACKET_IDENT',
          message: 'Unclosed bracketed identifier [...].',
        });
      }
      tokens.push({ type: 'quoted_ident', value: val, upper: val, line: startLine, col: startCol });
      continue;
    }

    // Number
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(sql[i + 1] || ''))) {
      let val = '';
      while (i < n && /[0-9._eE]/.test(sql[i])) {
        if ((sql[i] === 'e' || sql[i] === 'E') && (sql[i + 1] === '+' || sql[i + 1] === '-')) {
          val += sql[i] + sql[i + 1];
          advance(2);
          continue;
        }
        val += sql[i];
        advance();
      }
      tokens.push({ type: 'number', value: val, upper: val, line: startLine, col: startCol });
      continue;
    }

    // Word / Keyword / Identifier / Bind parameter (:param, @param, $1)
    if (/[A-Za-z_@:]/.test(ch) || (ch === '$' && /[0-9A-Za-z_]/.test(sql[i + 1] || ''))) {
      if (ch === ':' && sql[i + 1] === ':') {
        advance(2);
        tokens.push({ type: 'operator', value: '::', upper: '::', line: startLine, col: startCol });
        continue;
      }
      let val = ch;
      advance();
      while (i < n && /[A-Za-z0-9_$]/.test(sql[i])) {
        val += sql[i];
        advance();
      }
      tokens.push({ type: 'word', value: val, upper: val.toUpperCase(), line: startLine, col: startCol });
      continue;
    }

    if (ch === '(') {
      advance();
      tokens.push({ type: 'lparen', value: '(', upper: '(', line: startLine, col: startCol });
      continue;
    }
    if (ch === ')') {
      advance();
      tokens.push({ type: 'rparen', value: ')', upper: ')', line: startLine, col: startCol });
      continue;
    }
    if (ch === ',') {
      advance();
      tokens.push({ type: 'comma', value: ',', upper: ',', line: startLine, col: startCol });
      continue;
    }
    if (ch === ';') {
      advance();
      tokens.push({ type: 'semicolon', value: ';', upper: ';', line: startLine, col: startCol });
      continue;
    }
    if (ch === '.') {
      advance();
      tokens.push({ type: 'dot', value: '.', upper: '.', line: startLine, col: startCol });
      continue;
    }

    // Multi-char operators
    const three = sql.slice(i, i + 3);
    const two = sql.slice(i, i + 2);
    if (three === '->>' || three === '#>>') {
      advance(3);
      tokens.push({ type: 'operator', value: three, upper: three, line: startLine, col: startCol });
      continue;
    }
    if (['<>', '!=', '<=', '>=', '||', '::', '->', '#>', '&&', '@>', '<@', '?|', '?&'].includes(two)) {
      advance(2);
      tokens.push({ type: 'operator', value: two, upper: two, line: startLine, col: startCol });
      continue;
    }

    advance();
    tokens.push({ type: 'operator', value: ch, upper: ch, line: startLine, col: startCol });
  }

  return { tokens, lexErrors };
}

function applyKeywordCase(word: string, upper: string, mode: SqlKeywordCase): string {
  if (!SQL_KEYWORDS.has(upper)) return word;
  if (mode === 'upper') return upper;
  if (mode === 'lower') return upper.toLowerCase();
  return word;
}

function formatPhrase(phrase: string, mode: SqlKeywordCase): string {
  if (mode === 'upper') return phrase.toUpperCase();
  if (mode === 'lower') return phrase.toLowerCase();
  return phrase;
}

function getIndentUnit(indent?: '2' | '4' | 'tab'): string {
  if (indent === 'tab') return '\t';
  if (indent === '4') return '    ';
  return '  ';
}

function matchCompoundClause(tokens: Token[], idx: number): { phrase: string; consumed: number } | null {
  const t0 = tokens[idx];
  if (!t0 || t0.type !== 'word') return null;
  const t1 = tokens[idx + 1];
  const t2 = tokens[idx + 2];

  if (t1?.type === 'word' && t2?.type === 'word') {
    const p3 = `${t0.upper} ${t1.upper} ${t2.upper}`;
    if (MAJOR_CLAUSES.has(p3)) return { phrase: p3, consumed: 3 };
  }
  if (t1?.type === 'word') {
    const p2 = `${t0.upper} ${t1.upper}`;
    if (MAJOR_CLAUSES.has(p2)) return { phrase: p2, consumed: 2 };
  }
  if (MAJOR_CLAUSES.has(t0.upper)) {
    return { phrase: t0.upper, consumed: 1 };
  }
  return null;
}

function formatClauseHeading(label: string, depth: number, indentUnit: string, alignClauses: boolean): string {
  const baseIndent = indentUnit.repeat(depth);
  if (!alignClauses) {
    return baseIndent + label;
  }
  const pad = Math.max(0, CLAUSE_LABEL_WIDTH - label.length);
  return baseIndent + ' '.repeat(pad) + label;
}

/**
 * Format or Beautify SQL query text.
 */
export function formatSql(sql: string, options: SqlFormatOptions = {}): string {
  const dialect = options.dialect ?? 'ansi';
  const indentUnit = getIndentUnit(options.indent ?? '2');
  const keywordCase = options.keywordCase ?? 'upper';
  const commaPosition = options.commaPosition ?? 'trailing';
  const linesBetween = options.linesBetweenQueries ?? 1;
  const alignClauses = options.alignClauses ?? false;
  const stripComments = options.stripComments ?? false;

  const { tokens: rawTokens } = tokenizeSql(sql, dialect);
  const tokens = rawTokens.filter(t => {
    if (t.type === 'whitespace') return false;
    if (stripComments && (t.type === 'line_comment' || t.type === 'block_comment')) return false;
    return true;
  });

  if (tokens.length === 0) return '';

  const lines: string[] = [];
  let currentLine = '';
  let parenDepth = 0;
  let inSelectList = false;
  let inWhereOrHaving = false;
  let inSetList = false;
  let caseDepth = 0;
  let prevToken: Token | null = null;

  const flushLine = () => {
    const trimmed = currentLine.trimEnd();
    if (trimmed.length > 0) {
      lines.push(trimmed);
    }
    currentLine = '';
  };

  const bodyIndent = (extra = 0) => {
    if (alignClauses) {
      return indentUnit.repeat(parenDepth) + ' '.repeat(CLAUSE_LABEL_WIDTH + 1) + indentUnit.repeat(extra);
    }
    return indentUnit.repeat(parenDepth + 1 + extra);
  };

  const appendTokenText = (text: string, noSpaceBefore = false) => {
    if (!currentLine) {
      currentLine = text;
    } else if (noSpaceBefore || currentLine.endsWith('(') || currentLine.endsWith('.') || currentLine.endsWith('::') || currentLine.endsWith(' ')) {
      currentLine += text;
    } else {
      currentLine += ' ' + text;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const nextTok = tokens[i + 1];

    // Comments
    if (tok.type === 'line_comment' || tok.type === 'block_comment') {
      if (currentLine.trim()) {
        currentLine += ' ' + tok.value;
        flushLine();
      } else {
        lines.push(indentUnit.repeat(parenDepth) + tok.value);
      }
      prevToken = tok;
      continue;
    }

    // Semicolon terminates a statement
    if (tok.type === 'semicolon') {
      currentLine = currentLine.trimEnd() + ';';
      flushLine();
      if (i < tokens.length - 1) {
        for (let b = 0; b < linesBetween; b++) {
          lines.push('');
        }
      }
      parenDepth = 0;
      inSelectList = false;
      inWhereOrHaving = false;
      inSetList = false;
      caseDepth = 0;
      prevToken = tok;
      continue;
    }

    // Compound or major clause at current parenthesis depth
    const clause = matchCompoundClause(tokens, i);
    if (clause && !(clause.phrase === 'SET' && prevToken?.upper === 'CHARACTER')) {
      const phrase = clause.phrase;
      const formattedPhrase = formatPhrase(
        tokens
          .slice(i, i + clause.consumed)
          .map(t => t.value)
          .join(' '),
        keywordCase
      );

      if (currentLine.trim()) flushLine();

      const heading = formatClauseHeading(formattedPhrase, parenDepth, indentUnit, alignClauses);

      if (phrase === 'SELECT') {
        inSelectList = true;
        inWhereOrHaving = false;
        inSetList = false;
        if (alignClauses) {
          currentLine = heading;
        } else {
          lines.push(heading);
          currentLine = bodyIndent();
        }
      } else if (phrase === 'SET') {
        inSelectList = false;
        inWhereOrHaving = false;
        inSetList = true;
        if (alignClauses) {
          currentLine = heading;
        } else {
          lines.push(heading);
          currentLine = bodyIndent();
        }
      } else if (phrase === 'WHERE' || phrase === 'HAVING') {
        inSelectList = false;
        inWhereOrHaving = true;
        inSetList = false;
        currentLine = heading;
      } else if (phrase === 'UNION' || phrase === 'UNION ALL' || phrase === 'INTERSECT' || phrase === 'EXCEPT') {
        inSelectList = false;
        inWhereOrHaving = false;
        inSetList = false;
        lines.push(heading);
      } else {
        inSelectList = false;
        inWhereOrHaving = false;
        inSetList = false;
        currentLine = heading;
      }

      prevToken = tokens[i + clause.consumed - 1];
      i += clause.consumed - 1;
      continue;
    }

    // CASE / WHEN / THEN / ELSE / END alignment
    if (tok.type === 'word' && tok.upper === 'CASE') {
      caseDepth++;
      appendTokenText(applyKeywordCase(tok.value, tok.upper, keywordCase));
      prevToken = tok;
      continue;
    }
    if (tok.type === 'word' && (tok.upper === 'WHEN' || tok.upper === 'ELSE') && caseDepth > 0) {
      flushLine();
      currentLine = bodyIndent(caseDepth) + applyKeywordCase(tok.value, tok.upper, keywordCase);
      prevToken = tok;
      continue;
    }
    if (tok.type === 'word' && tok.upper === 'END' && caseDepth > 0) {
      caseDepth = Math.max(0, caseDepth - 1);
      flushLine();
      currentLine = bodyIndent(caseDepth) + applyKeywordCase(tok.value, tok.upper, keywordCase);
      prevToken = tok;
      continue;
    }

    // AND / OR inside WHERE or HAVING
    if (tok.type === 'word' && (tok.upper === 'AND' || tok.upper === 'OR') && inWhereOrHaving && parenDepth === 0) {
      flushLine();
      const kw = applyKeywordCase(tok.value, tok.upper, keywordCase);
      if (alignClauses) {
        currentLine = formatClauseHeading(kw, parenDepth, indentUnit, true);
      } else {
        currentLine = bodyIndent() + kw;
      }
      prevToken = tok;
      continue;
    }

    // Comma handling inside SELECT / SET / ORDER BY / GROUP BY
    if (tok.type === 'comma') {
      if ((inSelectList || inSetList) && parenDepth === 0) {
        if (commaPosition === 'leading') {
          flushLine();
          currentLine = bodyIndent() + ', ';
        } else {
          currentLine = currentLine.trimEnd() + ',';
          flushLine();
          currentLine = bodyIndent();
        }
      } else {
        currentLine = currentLine.trimEnd() + ',';
      }
      prevToken = tok;
      continue;
    }

    // Parentheses: expand subqueries (SELECT / WITH inside parens)
    if (tok.type === 'lparen') {
      const isSubquery = nextTok?.type === 'word' && (nextTok.upper === 'SELECT' || nextTok.upper === 'WITH');
      const isFuncCall = prevToken?.type === 'word' && !SQL_KEYWORDS.has(prevToken.upper);
      const isSqlFunc =
        prevToken?.type === 'word' &&
        ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST', 'LOWER', 'UPPER', 'TRIM', 'LENGTH', 'NOW', 'CONCAT', 'SUBSTRING', 'DATE_TRUNC', 'EXTRACT', 'JSON_AGG', 'JSONB_BUILD_OBJECT'].includes(
          prevToken.upper
        );

      if (isSubquery) {
        appendTokenText('(');
        flushLine();
        parenDepth++;
      } else {
        appendTokenText('(', isFuncCall || isSqlFunc);
        parenDepth++;
      }
      prevToken = tok;
      continue;
    }

    if (tok.type === 'rparen') {
      parenDepth = Math.max(0, parenDepth - 1);
      if (!currentLine.trim()) {
        currentLine = indentUnit.repeat(parenDepth) + ')';
      } else {
        currentLine = currentLine.trimEnd() + ')';
      }
      prevToken = tok;
      continue;
    }

    // Dot (table.column)
    if (tok.type === 'dot') {
      currentLine = currentLine.trimEnd() + '.';
      prevToken = tok;
      continue;
    }

    // Typecast operator ::
    if (tok.type === 'operator' && tok.value === '::') {
      currentLine = currentLine.trimEnd() + '::';
      prevToken = tok;
      continue;
    }

    // Regular word / literal / number / operator
    const text = tok.type === 'word' ? applyKeywordCase(tok.value, tok.upper, keywordCase) : tok.value;
    appendTokenText(text);
    prevToken = tok;
  }

  flushLine();
  return lines.join('\n').trim();
}

/**
 * Minify SQL query safely while preserving string literals, quoted identifiers, and syntax spacing.
 */
export function minifySql(sql: string, options: SqlMinifyOptions = {}): string {
  const dialect = options.dialect ?? 'ansi';
  const stripComments = options.stripComments ?? true;
  const { tokens } = tokenizeSql(sql, dialect);

  const out: string[] = [];
  let prev: Token | null = null;

  const isWordLike = (t: Token | null) =>
    t !== null && (t.type === 'word' || t.type === 'number' || t.type === 'quoted_ident' || t.type === 'string');

  for (const tok of tokens) {
    if (tok.type === 'whitespace') continue;
    if (tok.type === 'line_comment') {
      if (stripComments) continue;
      out.push((out.length ? ' ' : '') + tok.value + '\n');
      prev = tok;
      continue;
    }
    if (tok.type === 'block_comment') {
      if (stripComments) continue;
      out.push((out.length ? ' ' : '') + tok.value);
      prev = tok;
      continue;
    }

    let needsSpace = false;
    if (prev && prev.type !== 'line_comment') {
      if (tok.type === 'comma' || tok.type === 'semicolon' || tok.type === 'rparen' || tok.type === 'dot') {
        needsSpace = false;
      } else if (prev.type === 'lparen' || prev.type === 'dot') {
        needsSpace = false;
      } else if (tok.type === 'operator' && tok.value === '::') {
        needsSpace = false;
      } else if (prev.type === 'operator' && prev.value === '::') {
        needsSpace = false;
      } else if (tok.type === 'lparen') {
        // Keep space before ( after keywords like IN (, VALUES (, WHERE (, AND (
        needsSpace = prev.type === 'word' && SQL_KEYWORDS.has(prev.upper) && !['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST'].includes(prev.upper);
      } else if (isWordLike(prev) && isWordLike(tok)) {
        needsSpace = true;
      } else if (prev.type === 'rparen' && isWordLike(tok)) {
        needsSpace = true;
      } else if (prev.type === 'semicolon') {
        needsSpace = true;
      } else if (prev.type === 'block_comment') {
        needsSpace = true;
      }
    }

    out.push((needsSpace ? ' ' : '') + tok.value);
    prev = tok;
  }

  return out.join('').trim();
}

const VALID_STATEMENT_STARTERS = new Set([
  'SELECT', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP',
  'TRUNCATE', 'BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'SET', 'SHOW',
  'DESCRIBE', 'DESC', 'EXPLAIN', 'ANALYZE', 'VACUUM', 'PRAGMA', 'USE', 'GRANT', 'REVOKE',
  'CALL', 'EXEC', 'EXECUTE', 'DECLARE', 'DO', 'VALUES', 'REPLACE', 'UPSERT', 'COMMENT',
]);

/**
 * Validate SQL syntax & detect common mistakes / safety issues.
 */
export function validateSql(sql: string, dialect: SqlDialect = 'ansi'): SqlValidationResult {
  const { tokens: rawTokens, lexErrors } = tokenizeSql(sql, dialect);
  const diagnostics: SqlDiagnostic[] = [...lexErrors];
  const statements: SqlStatementSummary[] = [];

  const sigTokens = rawTokens.filter(
    t => t.type !== 'whitespace' && t.type !== 'line_comment' && t.type !== 'block_comment'
  );

  if (sigTokens.length === 0) {
    return {
      valid: true,
      errors: [],
      warnings: [],
      infos: [],
      statements: [],
      tokenCount: 0,
    };
  }

  // Split into statements by top-level semicolons
  const stmtGroups: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const tok of sigTokens) {
    if (tok.type === 'lparen') depth++;
    if (tok.type === 'rparen') depth = Math.max(0, depth - 1);
    if (tok.type === 'semicolon' && depth === 0) {
      if (current.length > 0) {
        stmtGroups.push(current);
        current = [];
      }
    } else {
      current.push(tok);
    }
  }
  if (current.length > 0) {
    stmtGroups.push(current);
  }

  stmtGroups.forEach((stmt, idx) => {
    const first = stmt[0];
    const last = stmt[stmt.length - 1];
    const stmtType = first.type === 'word' ? first.upper : 'UNKNOWN';

    // 1. Validate statement starter
    if (first.type !== 'word' || !VALID_STATEMENT_STARTERS.has(first.upper)) {
      diagnostics.push({
        severity: 'error',
        line: first.line,
        column: first.col,
        code: 'INVALID_STATEMENT_START',
        message: `Unexpected token "${first.value}" at start of statement #${idx + 1}. Expected a SQL keyword (SELECT, INSERT, UPDATE, DELETE, CREATE, WITH, etc.).`,
      });
    }

    // 2. Parenthesis & CASE/END balance per statement
    const parenStack: Token[] = [];
    const caseStack: Token[] = [];
    let hasWhere = false;
    const tables: string[] = [];

    const clausePositions: Record<string, Token> = {};

    for (let i = 0; i < stmt.length; i++) {
      const tok = stmt[i];
      const prev = stmt[i - 1];
      const next = stmt[i + 1];

      if (tok.type === 'lparen') {
        parenStack.push(tok);
      } else if (tok.type === 'rparen') {
        if (parenStack.length === 0) {
          diagnostics.push({
            severity: 'error',
            line: tok.line,
            column: tok.col,
            code: 'UNMATCHED_RPAREN',
            message: 'Unexpected closing parenthesis ")" without a matching "(".',
          });
        } else {
          parenStack.pop();
        }
      }

      if (tok.type === 'word' && tok.upper === 'CASE') {
        caseStack.push(tok);
      } else if (tok.type === 'word' && tok.upper === 'END') {
        if (caseStack.length > 0) {
          caseStack.pop();
        }
      }

      // Double / leading / trailing commas
      if (tok.type === 'comma') {
        if (!prev || prev.type === 'comma' || prev.type === 'lparen') {
          diagnostics.push({
            severity: 'error',
            line: tok.line,
            column: tok.col,
            code: 'UNEXPECTED_COMMA',
            message: 'Unexpected comma "," with no preceding expression.',
          });
        }
        if (!next || next.type === 'rparen' || (next.type === 'word' && ['FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'SET', 'VALUES'].includes(next.upper))) {
          diagnostics.push({
            severity: 'error',
            line: tok.line,
            column: tok.col,
            code: 'TRAILING_COMMA',
            message: `Trailing comma "," before ${next ? `"${next.value}"` : 'end of statement'}.`,
          });
        }
      }

      // Top-level clause tracking for SELECT statements
      if (parenStack.length === 0 && tok.type === 'word') {
        if (tok.upper === 'WHERE') {
          hasWhere = true;
          clausePositions['WHERE'] = clausePositions['WHERE'] || tok;
          if (!next || (next.type === 'word' && ['GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION'].includes(next.upper))) {
            diagnostics.push({
              severity: 'error',
              line: tok.line,
              column: tok.col,
              code: 'EMPTY_WHERE',
              message: 'WHERE clause is missing a filter condition.',
            });
          }
        }
        if (tok.upper === 'FROM') {
          clausePositions['FROM'] = clausePositions['FROM'] || tok;
          if (!next || (next.type === 'word' && ['WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT'].includes(next.upper))) {
            diagnostics.push({
              severity: 'error',
              line: tok.line,
              column: tok.col,
              code: 'MISSING_TABLE',
              message: 'FROM clause is missing a table or subquery.',
            });
          } else if (next.type === 'word' || next.type === 'quoted_ident') {
            let tbl = next.value;
            if (stmt[i + 2]?.type === 'dot' && stmt[i + 3]) {
              tbl += '.' + stmt[i + 3].value;
            }
            if (!tables.includes(tbl)) tables.push(tbl);
          }
        }
        if (tok.upper === 'JOIN') {
          if (!next) {
            diagnostics.push({
              severity: 'error',
              line: tok.line,
              column: tok.col,
              code: 'INCOMPLETE_JOIN',
              message: 'JOIN clause is missing a target table.',
            });
          } else if (next.type === 'word' || next.type === 'quoted_ident') {
            let tbl = next.value;
            if (stmt[i + 2]?.type === 'dot' && stmt[i + 3]) {
              tbl += '.' + stmt[i + 3].value;
            }
            if (!tables.includes(tbl)) tables.push(tbl);
          }
          // Check JOIN has ON or USING unless CROSS/NATURAL JOIN
          const isCrossOrNatural = prev?.type === 'word' && (prev.upper === 'CROSS' || prev.upper === 'NATURAL');
          if (!isCrossOrNatural) {
            let foundOnOrUsing = false;
            let jDepth = 0;
            for (let j = i + 1; j < stmt.length; j++) {
              if (stmt[j].type === 'lparen') jDepth++;
              if (stmt[j].type === 'rparen') jDepth = Math.max(0, jDepth - 1);
              if (jDepth === 0 && stmt[j].type === 'word') {
                if (stmt[j].upper === 'ON' || stmt[j].upper === 'USING') {
                  foundOnOrUsing = true;
                  break;
                }
                if (['JOIN', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION'].includes(stmt[j].upper)) {
                  break;
                }
              }
            }
            if (!foundOnOrUsing) {
              diagnostics.push({
                severity: 'warning',
                line: tok.line,
                column: tok.col,
                code: 'JOIN_WITHOUT_ON',
                message: 'JOIN clause has no ON or USING condition (may produce a Cartesian product).',
              });
            }
          }
        }
        if ((tok.upper === 'GROUP' || tok.upper === 'ORDER') && next?.upper !== 'BY') {
          diagnostics.push({
            severity: 'error',
            line: tok.line,
            column: tok.col,
            code: 'MISSING_BY',
            message: `Expected "BY" after "${tok.value}".`,
          });
        }
        if (tok.upper === 'GROUP' && next?.upper === 'BY') {
          clausePositions['GROUP BY'] = clausePositions['GROUP BY'] || tok;
          if (!stmt[i + 2]) {
            diagnostics.push({
              severity: 'error',
              line: tok.line,
              column: tok.col,
              code: 'EMPTY_GROUP_BY',
              message: 'GROUP BY clause is missing column expressions.',
            });
          }
        }
        if (tok.upper === 'ORDER' && next?.upper === 'BY') {
          clausePositions['ORDER BY'] = clausePositions['ORDER BY'] || tok;
          if (!stmt[i + 2]) {
            diagnostics.push({
              severity: 'error',
              line: tok.line,
              column: tok.col,
              code: 'EMPTY_ORDER_BY',
              message: 'ORDER BY clause is missing column expressions.',
            });
          }
        }
        if (tok.upper === 'HAVING') {
          clausePositions['HAVING'] = clausePositions['HAVING'] || tok;
        }
        if (tok.upper === 'LIMIT') {
          clausePositions['LIMIT'] = clausePositions['LIMIT'] || tok;
          if (dialect === 'tsql' || dialect === 'oracle') {
            diagnostics.push({
              severity: 'warning',
              line: tok.line,
              column: tok.col,
              code: 'DIALECT_LIMIT',
              message: `LIMIT is not standard in ${dialect === 'tsql' ? 'SQL Server (use TOP or OFFSET ... FETCH NEXT)' : 'older Oracle versions (use FETCH FIRST n ROWS ONLY)'}.`,
            });
          }
        }
        if (tok.upper === 'INTO' && prev?.upper === 'INSERT' && next && (next.type === 'word' || next.type === 'quoted_ident')) {
          if (!tables.includes(next.value)) tables.push(next.value);
        }
        if (tok.upper === 'UPDATE' && i === 0 && next && (next.type === 'word' || next.type === 'quoted_ident')) {
          if (!tables.includes(next.value)) tables.push(next.value);
        }
        if (tok.upper === 'SELECT' && next?.type === 'operator' && next.value === '*') {
          diagnostics.push({
            severity: 'info',
            line: next.line,
            column: next.col,
            code: 'SELECT_STAR',
            message: 'Consider listing explicit columns instead of SELECT * in production queries.',
          });
        }
      }
    }

    for (const unclosed of parenStack) {
      diagnostics.push({
        severity: 'error',
        line: unclosed.line,
        column: unclosed.col,
        code: 'UNCLOSED_LPAREN',
        message: 'Unclosed opening parenthesis "(".',
      });
    }

    for (const unclosedCase of caseStack) {
      diagnostics.push({
        severity: 'error',
        line: unclosedCase.line,
        column: unclosedCase.col,
        code: 'UNCLOSED_CASE',
        message: 'CASE expression is missing a matching END keyword.',
      });
    }

    // Clause ordering checks for top-level SELECT
    if (stmtType === 'SELECT') {
      const order = ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT'];
      let lastSeenName = '';
      let lastSeenPos = -1;
      for (const name of order) {
        const t = clausePositions[name];
        if (!t) continue;
        const pos = stmt.indexOf(t);
        if (pos < lastSeenPos) {
          diagnostics.push({
            severity: 'error',
            line: t.line,
            column: t.col,
            code: 'INVALID_CLAUSE_ORDER',
            message: `Clause "${name}" appears before "${lastSeenName}". Standard SQL order is: SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT.`,
          });
        } else {
          lastSeenPos = pos;
          lastSeenName = name;
        }
      }
    }

    // Safety warnings for destructive DML without WHERE
    if ((stmtType === 'DELETE' || stmtType === 'UPDATE') && !hasWhere) {
      diagnostics.push({
        severity: 'warning',
        line: first.line,
        column: first.col,
        code: 'DML_WITHOUT_WHERE',
        message: `${stmtType} statement has no WHERE clause — this will affect EVERY row in the table!`,
      });
    }

    const preview = stmt
      .slice(0, 12)
      .map(t => t.value)
      .join(' ')
      .slice(0, 80);

    statements.push({
      index: idx + 1,
      type: stmtType,
      startLine: first.line,
      endLine: last.line,
      tables,
      hasWhere,
      preview: preview + (stmt.length > 12 ? '…' : ''),
    });
  });

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');
  const infos = diagnostics.filter(d => d.severity === 'info');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    infos,
    statements,
    tokenCount: sigTokens.length,
  };
}
