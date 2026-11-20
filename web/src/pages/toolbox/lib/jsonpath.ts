// JSONPath Query Evaluator
// Supports $, .prop, [index], [*], [start:end], ..prop, and filter predicates [?(@.field == val)]

export interface JsonPathResult {
  path: string;
  value: any;
}

export function evaluateJsonPath(root: any, expression: string): { results: any[]; paths: string[]; error?: string } {
  const expr = expression.trim();
  if (!expr) {
    return { results: [], paths: [] };
  }

  if (!expr.startsWith('$')) {
    return { results: [], paths: [], error: 'JSONPath expression must start with "$"' };
  }

  try {
    const collected: { path: string; value: any }[] = [];

    const recurse = (current: any, currentPath: string, tokens: string[]) => {
      if (tokens.length === 0) {
        collected.push({ path: currentPath, value: current });
        return;
      }

      const token = tokens[0];
      const rest = tokens.slice(1);

      if (token.startsWith('..')) {
        // Recursive descent: matches current level and all descendants
        const targetProp = token.slice(2);
        const searchAll = (node: any, path: string) => {
          if (node === null || typeof node !== 'object') return;
          if (targetProp === '*' || Object.prototype.hasOwnProperty.call(node, targetProp)) {
            const nextPath = Array.isArray(node) ? `${path}[${targetProp}]` : `${path}.${targetProp}`;
            recurse(node[targetProp], nextPath, rest);
          }
          if (Array.isArray(node)) {
            node.forEach((item, idx) => searchAll(item, `${path}[${idx}]`));
          } else {
            Object.keys(node).forEach(key => searchAll(node[key], `${path}.${key}`));
          }
        };
        searchAll(current, currentPath);
        return;
      }

      if (current === null || typeof current !== 'object') return;

      if (token === '*') {
        if (Array.isArray(current)) {
          current.forEach((item, idx) => recurse(item, `${currentPath}[${idx}]`, rest));
        } else {
          Object.keys(current).forEach(k => recurse(current[k], `${currentPath}.${k}`, rest));
        }
        return;
      }

      // Filter expression: [?(@.prop op val)]
      if (token.startsWith('?(') && token.endsWith(')')) {
        if (!Array.isArray(current)) return;
        const predicate = token.slice(2, -1).trim();
        current.forEach((item, idx) => {
          if (evalPredicate(item, predicate)) {
            recurse(item, `${currentPath}[${idx}]`, rest);
          }
        });
        return;
      }

      // Array slice [start:end]
      if (token.includes(':') && !token.startsWith('?')) {
        if (!Array.isArray(current)) return;
        const parts = token.split(':').map(p => p.trim());
        const start = parts[0] ? parseInt(parts[0], 10) : 0;
        const end = parts[1] ? parseInt(parts[1], 10) : current.length;
        const sliced = current.slice(start, end);
        sliced.forEach((item, i) => recurse(item, `${currentPath}[${start + i}]`, rest));
        return;
      }

      // Array index or property access
      if (Array.isArray(current)) {
        const idx = parseInt(token, 10);
        const actualIdx = idx < 0 ? current.length + idx : idx;
        if (!isNaN(actualIdx) && actualIdx >= 0 && actualIdx < current.length) {
          recurse(current[actualIdx], `${currentPath}[${actualIdx}]`, rest);
        }
      } else if (Object.prototype.hasOwnProperty.call(current, token)) {
        recurse(current[token], `${currentPath}.${token}`, rest);
      }
    };

    // Tokenize expression
    const tokens = tokenizePath(expr);
    recurse(root, '$', tokens);

    return {
      results: collected.map(c => c.value),
      paths: collected.map(c => c.path),
    };
  } catch (err: any) {
    return { results: [], paths: [], error: err.message || 'JSONPath evaluation error' };
  }
}

function tokenizePath(expr: string): string[] {
  // Strip leading $
  let s = expr.slice(1);
  const tokens: string[] = [];
  let i = 0;

  while (i < s.length) {
    if (s.startsWith('..', i)) {
      i += 2;
      let prop = '';
      while (i < s.length && s[i] !== '.' && s[i] !== '[') {
        prop += s[i];
        i++;
      }
      tokens.push('..' + (prop || '*'));
    } else if (s[i] === '.') {
      i++;
      let prop = '';
      while (i < s.length && s[i] !== '.' && s[i] !== '[') {
        prop += s[i];
        i++;
      }
      if (prop) tokens.push(prop);
    } else if (s[i] === '[') {
      i++;
      let content = '';
      while (i < s.length && s[i] !== ']') {
        content += s[i];
        i++;
      }
      i++; // skip ']'
      // unquote if ['name']
      const unquoted = content.replace(/^['"]|['"]$/g, '');
      tokens.push(unquoted);
    } else {
      i++;
    }
  }

  return tokens;
}

function evalPredicate(item: any, predicate: string): boolean {
  if (item === null || typeof item !== 'object') return false;

  // Supports @.field == val, @.field != val, @.field > val, @.field < val, @.field >= val, @.field <= val
  const match = predicate.match(/@\.([a-zA-Z0-9_-]+)\s*(===|==|!=|<=|>=|<|>)\s*(.+)/);
  if (!match) {
    // Check existence: @.field
    const existMatch = predicate.match(/@\.([a-zA-Z0-9_-]+)/);
    return existMatch ? Object.prototype.hasOwnProperty.call(item, existMatch[1]) : false;
  }

  const [, field, op, rawVal] = match;
  const left = item[field];
  let right: any = rawVal.trim();

  // Parse right value
  if (right.startsWith("'") || right.startsWith('"')) {
    right = right.slice(1, -1);
  } else if (right === 'true') {
    right = true;
  } else if (right === 'false') {
    right = false;
  } else if (right === 'null') {
    right = null;
  } else if (!isNaN(Number(right))) {
    right = Number(right);
  }

  switch (op) {
    case '==':
    case '===':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    default:
      return false;
  }
}
