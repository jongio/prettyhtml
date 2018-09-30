import {
  ParseSourceSpan,
  splitNsName,
  Element,
  Comment,
  Text,
  Node,
  Doctype
} from '@starptech/webparser'

const htmlSchema = require('property-information/html')
const svgSchema = require('property-information/svg')
const hastSvg = require('@starptech/prettyhtml-hastscript/svg')
const hast = require('@starptech/prettyhtml-hastscript')

function isFakeRoot(obj: Element): boolean {
  return obj.name === ':webparser:root'
}

type Options = {
  file?: string
  verbose?: boolean
  schema?: { space: string }
  documentMode?: boolean
}

type HastNode = {
  name?: string
  type: string
  tagName?: string
  properties?: Array<Object>
  position?: { start: any; end: any }
  children?: HastNode[]
  public?: string
  system?: string
  value?: string
  data?: { [name: string]: any }
}

/* Wrapper to normalise options. */
export = function from(rootNodes: Node[], options: Options = {}) {
  const sourceSpan = new ParseSourceSpan(null, null)
  const fakeRoot = new Element(':webparser:root', [], rootNodes, sourceSpan)
  const result = transform(fakeRoot, {
    schema: htmlSchema,
    file: options.file,
    verbose: options.verbose
  })

  return result
}

/* Transform a node. */
function transform(ast: Node, config: Options): HastNode {
  const schema = config.schema
  let node: HastNode

  if (ast instanceof Element) {
    let children: HastNode[]
    config.schema = getNameAndNS(ast.name).ns === 'svg' ? svgSchema : htmlSchema
    if (ast.children && ast.children.length) {
      children = nodes(ast.children, config)
    }

    if (isFakeRoot(ast)) {
      node = root(ast, children)
    } else {
      node = element(ast, children, config)
    }

    node.data = node.data || {}
    node.data.selfClosing =
      ast.startSourceSpan === ast.endSourceSpan &&
      ast.startSourceSpan !== null &&
      ast.endSourceSpan !== null
  } else if (ast instanceof Text) {
    node = text(ast)
  } else if (ast instanceof Comment) {
    node = comment(ast)
  } else if (ast instanceof Doctype) {
    node = {
      type: 'doctype',
      name: 'html',
      public: null,
      system: null
    }
  }

  if (ast instanceof Element) {
    if (ast.startSourceSpan && ast.endSourceSpan) {
      node.position = {
        start: {
          // webparser format counts lines beginning with zero
          line: ast.startSourceSpan.start.line++,
          column: ast.startSourceSpan.start.col,
          offset: ast.startSourceSpan.start.offset
        },
        end: {
          line: ast.endSourceSpan.end.line++,
          column: ast.endSourceSpan.end.col,
          offset: ast.endSourceSpan.end.offset
        }
      }
    }
  } else {
    node.position = {
      start: {
        line: ast.sourceSpan.start.line++,
        column: ast.sourceSpan.start.col,
        offset: ast.sourceSpan.start.offset
      },
      end: {
        line: ast.sourceSpan.end.line++,
        column: ast.sourceSpan.end.col,
        offset: ast.sourceSpan.end.offset
      }
    }
  }

  config.schema = schema

  return node
}

/* Transform children. */
function nodes(children: Node[], config: Options): HastNode[] {
  const length = children.length
  let index = -1
  const result: HastNode[] = []

  while (++index < length) {
    result[index] = transform(children[index], config)
  }

  return result
}

function root(ast: Node, children: HastNode[]): HastNode {
  return { type: 'root', children, data: {} }
}

/* Transform a text. */
function text(ast: Text): HastNode {
  return { type: 'text', value: ast.value }
}

/* Transform a comment. */
function comment(ast: Comment): HastNode {
  return { type: 'comment', value: ast.value }
}

function getNameAndNS(name: string) {
  // support vue :foo attributes but respect
  // namepsace syntax from webparser like :ns:attribute
  if (name.split(':').length === 2) {
    return { ns: null, name: name }
  }

  const info = splitNsName(name)
  return { ns: info[0], name: info[1] }
}

/* Transform an element. */
function element(
  ast: Element,
  children: HastNode[],
  config: Options
): HastNode {
  const fn = config.schema.space === 'svg' ? hastSvg : hast
  const name = getNameAndNS(ast.name).name
  const props: { [name: string]: string } = {}
  let node

  for (const attr of ast.attrs) {
    const attrInfo = getNameAndNS(attr.name)
    props[attrInfo.ns ? attrInfo.ns + ':' + attrInfo.name : attrInfo.name] =
      attr.value
  }

  node = fn(name, props, children)

  return node
}
