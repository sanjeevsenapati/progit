// XML XPath Evaluator
// Evaluates XPath expressions against XML strings using browser DOMParser and XPathEvaluator

export interface XPathMatch {
  nodeName: string;
  nodeType: string;
  value: string;
  xml: string;
  path: string;
}

export interface XPathResult {
  matches: XPathMatch[];
  count: number;
  resultType: string;
  error?: string;
}

export function evaluateXPath(xmlString: string, expression: string): XPathResult {
  const expr = expression.trim();
  if (!xmlString.trim() || !expr) {
    return { matches: [], count: 0, resultType: 'EMPTY' };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return {
        matches: [],
        count: 0,
        resultType: 'ERROR',
        error: `XML Parsing Error: ${parserError.textContent?.trim() || 'Invalid XML syntax'}`,
      };
    }

    // Default resolver ignores default namespaces so standard //tag works naturally
    const nsResolver = (prefix: string | null) => {
      if (!prefix) return null;
      return doc.lookupNamespaceURI(prefix) || null;
    };

    const evaluated = doc.evaluate(
      expr,
      doc,
      nsResolver,
      XPathResult.ANY_TYPE,
      null
    );

    const matches: XPathMatch[] = [];

    switch (evaluated.resultType) {
      case XPathResult.NUMBER_TYPE:
        return {
          matches: [{
            nodeName: 'number',
            nodeType: 'NUMBER',
            value: String(evaluated.numberValue),
            xml: String(evaluated.numberValue),
            path: expr,
          }],
          count: 1,
          resultType: 'NUMBER',
        };

      case XPathResult.STRING_TYPE:
        return {
          matches: [{
            nodeName: 'string',
            nodeType: 'STRING',
            value: evaluated.stringValue,
            xml: evaluated.stringValue,
            path: expr,
          }],
          count: 1,
          resultType: 'STRING',
        };

      case XPathResult.BOOLEAN_TYPE:
        return {
          matches: [{
            nodeName: 'boolean',
            nodeType: 'BOOLEAN',
            value: String(evaluated.booleanValue),
            xml: String(evaluated.booleanValue),
            path: expr,
          }],
          count: 1,
          resultType: 'BOOLEAN',
        };

      case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
      case XPathResult.ORDERED_NODE_ITERATOR_TYPE: {
        let node = evaluated.iterateNext();
        const serializer = new XMLSerializer();

        while (node) {
          let nodeTypeStr = 'ELEMENT';
          let val = node.textContent?.trim() || '';
          let outer = '';

          if (node.nodeType === Node.ELEMENT_NODE) {
            nodeTypeStr = 'ELEMENT';
            outer = serializer.serializeToString(node);
          } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
            nodeTypeStr = 'ATTRIBUTE';
            val = (node as Attr).value;
            outer = `${(node as Attr).name}="${(node as Attr).value}"`;
          } else if (node.nodeType === Node.TEXT_NODE) {
            nodeTypeStr = 'TEXT';
            outer = node.textContent || '';
          } else {
            nodeTypeStr = `NODE_${node.nodeType}`;
            outer = serializer.serializeToString(node);
          }

          matches.push({
            nodeName: node.nodeName,
            nodeType: nodeTypeStr,
            value: val,
            xml: outer,
            path: getNodeXPath(node),
          });

          node = evaluated.iterateNext();
        }

        return {
          matches,
          count: matches.length,
          resultType: 'NODE_SET',
        };
      }

      default:
        return { matches: [], count: 0, resultType: 'UNKNOWN' };
    }
  } catch (err: any) {
    return {
      matches: [],
      count: 0,
      resultType: 'ERROR',
      error: err.message || 'Invalid XPath expression syntax',
    };
  }
}

function getNodeXPath(node: Node): string {
  if (node.nodeType === Node.ATTRIBUTE_NODE) {
    const owner = (node as Attr).ownerElement;
    return owner ? `${getNodeXPath(owner)}/@${(node as Attr).name}` : `@${(node as Attr).name}`;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return node.parentNode ? getNodeXPath(node.parentNode) : '';
  }

  const parts: string[] = [];
  let curr: Node | null = node;

  while (curr && curr.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sib = curr.previousSibling;
    while (sib) {
      if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === curr.nodeName) {
        index++;
      }
      sib = sib.previousSibling;
    }
    parts.unshift(`${curr.nodeName}[${index}]`);
    curr = curr.parentNode;
  }

  return '/' + parts.join('/');
}
