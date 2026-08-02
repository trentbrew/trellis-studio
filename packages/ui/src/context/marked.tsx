import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import katex from "katex"
import { bundledLanguages, type BundledLanguage } from "shiki"
import { createSimpleContext } from "./helper"
import { getSharedHighlighter, registerCustomTheme, ThemeRegistrationResolved } from "@pierre/diffs"
import { parse as parseFrontmatter, renderHtml as renderFrontmatterHtml } from "../components/frontmatter"
import { isWhiteboardEmbedPath } from "../lib/whiteboard-embed"

registerCustomTheme("OpenCode", () => {
  return Promise.resolve({
    name: "OpenCode",
    colors: {
      "editor.background": "var(--color-background-stronger)",
      "editor.foreground": "var(--text-base)",
      "gitDecoration.addedResourceForeground": "var(--syntax-diff-add)",
      "gitDecoration.deletedResourceForeground": "var(--syntax-diff-delete)",
      // "gitDecoration.conflictingResourceForeground": "#ffca00",
      // "gitDecoration.modifiedResourceForeground": "#1a76d4",
      // "gitDecoration.untrackedResourceForeground": "#00cab1",
      // "gitDecoration.ignoredResourceForeground": "#84848A",
      // "terminal.titleForeground": "#adadb1",
      // "terminal.titleInactiveForeground": "#84848A",
      // "terminal.background": "#141415",
      // "terminal.foreground": "#adadb1",
      // "terminal.ansiBlack": "#141415",
      // "terminal.ansiRed": "#ff2e3f",
      // "terminal.ansiGreen": "#0dbe4e",
      // "terminal.ansiYellow": "#ffca00",
      // "terminal.ansiBlue": "#008cff",
      // "terminal.ansiMagenta": "#c635e4",
      // "terminal.ansiCyan": "#08c0ef",
      // "terminal.ansiWhite": "#c6c6c8",
      // "terminal.ansiBrightBlack": "#141415",
      // "terminal.ansiBrightRed": "#ff2e3f",
      // "terminal.ansiBrightGreen": "#0dbe4e",
      // "terminal.ansiBrightYellow": "#ffca00",
      // "terminal.ansiBrightBlue": "#008cff",
      // "terminal.ansiBrightMagenta": "#c635e4",
      // "terminal.ansiBrightCyan": "#08c0ef",
      // "terminal.ansiBrightWhite": "#c6c6c8",
    },
    tokenColors: [
      {
        scope: ["comment", "punctuation.definition.comment", "string.comment"],
        settings: {
          foreground: "var(--syntax-comment)",
        },
      },
      {
        scope: ["entity.other.attribute-name"],
        settings: {
          foreground: "var(--syntax-property)", // maybe attribute
        },
      },
      {
        scope: ["constant", "entity.name.constant", "variable.other.constant", "variable.language", "entity"],
        settings: {
          foreground: "var(--syntax-constant)",
        },
      },
      {
        scope: ["entity.name", "meta.export.default", "meta.definition.variable"],
        settings: {
          foreground: "var(--syntax-type)",
        },
      },
      {
        scope: ["meta.object.member"],
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: [
          "variable.parameter.function",
          "meta.jsx.children",
          "meta.block",
          "meta.tag.attributes",
          "entity.name.constant",
          "meta.embedded.expression",
          "meta.template.expression",
          "string.other.begin.yaml",
          "string.other.end.yaml",
        ],
        settings: {
          foreground: "var(--syntax-punctuation)",
        },
      },
      {
        scope: ["entity.name.function", "support.type.primitive"],
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: ["support.class.component"],
        settings: {
          foreground: "var(--syntax-type)",
        },
      },
      {
        scope: "keyword",
        settings: {
          foreground: "var(--syntax-keyword)",
        },
      },
      {
        scope: [
          "keyword.operator",
          "storage.type.function.arrow",
          "punctuation.separator.key-value.css",
          "entity.name.tag.yaml",
          "punctuation.separator.key-value.mapping.yaml",
        ],
        settings: {
          foreground: "var(--syntax-operator)",
        },
      },
      {
        scope: ["storage", "storage.type"],
        settings: {
          foreground: "var(--syntax-keyword)",
        },
      },
      {
        scope: ["storage.modifier.package", "storage.modifier.import", "storage.type.java"],
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: [
          "string",
          "punctuation.definition.string",
          "string punctuation.section.embedded source",
          "entity.name.tag",
        ],
        settings: {
          foreground: "var(--syntax-string)",
        },
      },
      {
        scope: "support",
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: ["support.type.object.module", "variable.other.object", "support.type.property-name.css"],
        settings: {
          foreground: "var(--syntax-object)",
        },
      },
      {
        scope: "meta.property-name",
        settings: {
          foreground: "var(--syntax-property)",
        },
      },
      {
        scope: "variable",
        settings: {
          foreground: "var(--syntax-variable)",
        },
      },
      {
        scope: "variable.other",
        settings: {
          foreground: "var(--syntax-variable)",
        },
      },
      {
        scope: [
          "invalid.broken",
          "invalid.illegal",
          "invalid.unimplemented",
          "invalid.deprecated",
          "message.error",
          "markup.deleted",
          "meta.diff.header.from-file",
          "punctuation.definition.deleted",
          "brackethighlighter.unmatched",
          "token.error-token",
        ],
        settings: {
          foreground: "var(--syntax-critical)",
        },
      },
      {
        scope: "carriage-return",
        settings: {
          foreground: "var(--syntax-keyword)",
        },
      },
      {
        scope: "string source",
        settings: {
          foreground: "var(--syntax-variable)",
        },
      },
      {
        scope: "string variable",
        settings: {
          foreground: "var(--syntax-constant)",
        },
      },
      {
        scope: [
          "source.regexp",
          "string.regexp",
          "string.regexp.character-class",
          "string.regexp constant.character.escape",
          "string.regexp source.ruby.embedded",
          "string.regexp string.regexp.arbitrary-repitition",
          "string.regexp constant.character.escape",
        ],
        settings: {
          foreground: "var(--syntax-regexp)",
        },
      },
      {
        scope: "support.constant",
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: "support.variable",
        settings: {
          foreground: "var(--syntax-variable)",
        },
      },
      {
        scope: "meta.module-reference",
        settings: {
          foreground: "var(--syntax-info)",
        },
      },
      {
        scope: "punctuation.definition.list.begin.markdown",
        settings: {
          foreground: "var(--syntax-punctuation)",
        },
      },
      {
        scope: ["markup.heading", "markup.heading entity.name"],
        settings: {
          fontStyle: "bold",
          foreground: "var(--syntax-info)",
        },
      },
      {
        scope: "markup.quote",
        settings: {
          foreground: "var(--syntax-info)",
        },
      },
      {
        scope: "markup.italic",
        settings: {
          fontStyle: "italic",
          // foreground: "",
        },
      },
      {
        scope: "markup.bold",
        settings: {
          fontStyle: "bold",
          foreground: "var(--text-strong)",
        },
      },
      {
        scope: [
          "markup.raw",
          "markup.inserted",
          "meta.diff.header.to-file",
          "punctuation.definition.inserted",
          "markup.changed",
          "punctuation.definition.changed",
          "markup.ignored",
          "markup.untracked",
        ],
        settings: {
          foreground: "var(--text-base)",
        },
      },
      {
        scope: "meta.diff.range",
        settings: {
          fontStyle: "bold",
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "meta.diff.header",
        settings: {
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "meta.separator",
        settings: {
          fontStyle: "bold",
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "meta.output",
        settings: {
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "meta.export.default",
        settings: {
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: [
          "brackethighlighter.tag",
          "brackethighlighter.curly",
          "brackethighlighter.round",
          "brackethighlighter.square",
          "brackethighlighter.angle",
          "brackethighlighter.quote",
        ],
        settings: {
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: ["constant.other.reference.link", "string.other.link"],
        settings: {
          fontStyle: "underline",
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "token.info-token",
        settings: {
          foreground: "var(--syntax-info)",
        },
      },
      {
        scope: "token.warn-token",
        settings: {
          foreground: "var(--syntax-warning)",
        },
      },
      {
        scope: "token.debug-token",
        settings: {
          foreground: "var(--syntax-info)",
        },
      },
    ],
    semanticTokenColors: {
      comment: "var(--syntax-comment)",
      string: "var(--syntax-string)",
      number: "var(--syntax-constant)",
      regexp: "var(--syntax-regexp)",
      keyword: "var(--syntax-keyword)",
      variable: "var(--syntax-variable)",
      parameter: "var(--syntax-variable)",
      property: "var(--syntax-property)",
      function: "var(--syntax-primitive)",
      method: "var(--syntax-primitive)",
      type: "var(--syntax-type)",
      class: "var(--syntax-type)",
      namespace: "var(--syntax-type)",
      enumMember: "var(--syntax-primitive)",
      "variable.constant": "var(--syntax-constant)",
      "variable.defaultLibrary": "var(--syntax-unknown)",
    },
  } as unknown as ThemeRegistrationResolved)
})

const KATEX_RENDER_OPTS = {
  throwOnError: false,
  strict: false,
} as const

/** Dollar-delimited spans that are mostly numbers/dashes are prose (e.g. $5 – $10), not TeX. */
function isCurrencyLikeMath(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  return /^[\d\s.,+\-–—%$€£¥¢]*$/u.test(t)
}

function normalizeMathDashes(text: string): string {
  return text.replace(/[\u2013\u2014]/g, "-")
}

function renderKatex(math: string, displayMode: boolean): string | null {
  if (isCurrencyLikeMath(math)) return null
  try {
    return katex.renderToString(normalizeMathDashes(math), {
      ...KATEX_RENDER_OPTS,
      displayMode,
    })
  } catch {
    return null
  }
}

function patchMarkedKatexExtension(extension: ReturnType<typeof markedKatex>) {
  const extensions = extension.extensions
  if (!extensions) return extension

  for (const ext of extensions) {
    if (!("renderer" in ext) || typeof ext.renderer !== "function") continue
    const original = ext.renderer
    ext.renderer = function (token: any) {
      if (token && typeof token === "object" && "text" in token && "raw" in token) {
        if (isCurrencyLikeMath(token.text)) return token.raw
      }
      return original.call(this, token)
    }
  }
  return extension
}

function renderMathInText(text: string): string {
  let result = text

  // Display math: $$...$$
  const displayMathRegex = /\$\$([\s\S]*?)\$\$/g
  result = result.replace(displayMathRegex, (_, math) => {
    const rendered = renderKatex(math, true)
    return rendered ?? `$$${math}$$`
  })

  // Inline math: $...$
  const inlineMathRegex = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g
  result = result.replace(inlineMathRegex, (_, math) => {
    const rendered = renderKatex(math, false)
    return rendered ?? `$${math}$`
  })

  return result
}

function renderMathExpressions(html: string): string {
  // Split on code/pre/kbd tags to avoid processing their contents
  const codeBlockPattern = /(<(?:pre|code|kbd)[^>]*>[\s\S]*?<\/(?:pre|code|kbd)>)/gi
  const parts = html.split(codeBlockPattern)

  return parts
    .map((part, i) => {
      // Odd indices are the captured code blocks - leave them alone
      if (i % 2 === 1) return part
      // Process math only in non-code parts
      return renderMathInText(part)
    })
    .join("")
}

async function highlightCodeBlocks(html: string): Promise<string> {
  const codeBlockRegex = /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g
  const matches = [...html.matchAll(codeBlockRegex)]
  if (matches.length === 0) return html

  const highlighter = await getSharedHighlighter({
    themes: ["OpenCode"],
    langs: [],
    preferredHighlighter: "shiki-wasm",
  })

  let result = html
  for (const match of matches) {
    const [fullMatch, lang, escapedCode] = match
    const code = escapedCode
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")

    let language = lang || "text"
    if (!(language in bundledLanguages)) {
      language = "text"
    }
    if (!highlighter.getLoadedLanguages().includes(language)) {
      await highlighter.loadLanguage(language as BundledLanguage)
    }

    const highlighted = highlighter.codeToHtml(code, {
      lang: language,
      theme: "OpenCode",
      tabindex: false,
    })
    result = result.replace(fullMatch, () => highlighted)
  }

  return result
}

// ---------------------------------------------------------------------------
// Wiki-link extension for marked: [[namespace:target|alias]] → clickable chip
// ---------------------------------------------------------------------------

const WIKI_NAMESPACES = new Set(["issue", "file", "symbol", "identity", "milestone", "decision"])

function wikiExtension(): import("marked").MarkedExtension {
  return {
    extensions: [
      {
        name: "wikilink",
        level: "inline",
        start(src: string) {
          return src.indexOf("[[")
        },
        tokenizer(src: string) {
          const match = src.match(/^\[\[([^\]]+)\]\]/)
          if (!match) return undefined
          const inner = match[1]
          const pipe = inner.indexOf("|")
          const raw = pipe !== -1 ? inner.substring(0, pipe).trim() : inner.trim()
          const alias = pipe !== -1 ? inner.substring(pipe + 1).trim() : undefined
          const colon = raw.indexOf(":")
          let ns = ""
          let target = raw
          if (colon !== -1) {
            const prefix = raw.substring(0, colon)
            if (WIKI_NAMESPACES.has(prefix)) {
              ns = prefix
              target = raw.substring(colon + 1)
            }
          }
          if (!ns) {
            if (/^TRL-\d+$/i.test(target)) ns = "issue"
            else if (/^DEC-\d+$/i.test(target)) ns = "decision"
            else ns = "entity"
          }
          return {
            type: "wikilink",
            raw: match[0],
            namespace: ns,
            target,
            alias: alias || target,
          }
        },
        renderer(token: any) {
          if (token.namespace === "entity") {
            const href = `entity://${encodeURIComponent(token.target)}`
            return `<a href="${href}" class="wiki-link entity-link" data-wiki-ns="${token.namespace}" data-wiki-target="${token.target}">[[${token.alias}]]</a>`
          }
          const href = `wiki://${token.namespace}/${encodeURIComponent(token.target)}`
          return `<a href="${href}" class="wiki-link" data-wiki-ns="${token.namespace}" data-wiki-target="${token.target}">[[${token.alias}]]</a>`
        },
      },
    ],
  }
}

function frontmatterExtension(): import("marked").MarkedExtension {
  return {
    extensions: [
      {
        name: "frontmatter",
        level: "block",
        start(src: string) {
          return src.indexOf("---") === 0 ? 0 : undefined
        },
        tokenizer(src: string) {
          const result = parseFrontmatter(src)
          if (!result) return undefined
          return {
            type: "frontmatter",
            raw: src.slice(0, src.length - result.body.length),
            meta: result.meta,
          }
        },
        renderer(token: any) {
          return renderFrontmatterHtml(token.meta)
        },
      },
    ],
  }
}

export type NativeMarkdownParser = (markdown: string) => Promise<string>

export const { use: useMarked, provider: MarkedProvider } = createSimpleContext({
  name: "Marked",
  init: (props: { nativeParser?: NativeMarkdownParser }) => {
    const jsParser = marked.use(
      {
        renderer: {
          image({ href, title, text }) {
            if (isWhiteboardEmbedPath(href)) {
              const titleAttr = title ? ` title="${title}"` : ""
              const labelAttr = text ? ` data-whiteboard-label="${text.replace(/"/g, "&quot;")}"` : ""
              const pathAttr = href.replace(/"/g, "&quot;")
              return `<div data-component="whiteboard-embed" data-whiteboard-path="${pathAttr}"${labelAttr}${titleAttr}></div>`
            }
            const titleAttr = title ? ` title="${title}"` : ""
            const altAttr = text ? ` alt="${text}"` : ""
            return `<img src="${href}"${altAttr}${titleAttr}>`
          },
          link({ href, title, text }) {
            const titleAttr = title ? ` title="${title}"` : ""
            if (/^(?:https?|mailto|tel|wiki|entity|data|blob):/.test(href) || href.startsWith("#")) {
              return `<a href="${href}"${titleAttr} class="external-link" rel="noopener noreferrer">${text}</a>`
            }
            const escaped = href.replace(/"/g, "&quot;")
            return `<a href="${href}"${titleAttr} class="file-link" data-file-path="${escaped}">${text}</a>`
          },
        },
      },
      wikiExtension(),
      frontmatterExtension(),
      patchMarkedKatexExtension(
        markedKatex({
          ...KATEX_RENDER_OPTS,
          nonStandard: true,
        }),
      ),
      markedShiki({
        async highlight(code, lang) {
          const highlighter = await getSharedHighlighter({
            themes: ["OpenCode"],
            langs: [],
            preferredHighlighter: "shiki-wasm",
          })
          if (!(lang in bundledLanguages)) {
            lang = "text"
          }
          if (!highlighter.getLoadedLanguages().includes(lang)) {
            await highlighter.loadLanguage(lang as BundledLanguage)
          }
          return highlighter.codeToHtml(code, {
            lang: lang || "text",
            theme: "OpenCode",
            tabindex: false,
          })
        },
      }),
    )

    if (props.nativeParser) {
      const nativeParser = props.nativeParser
      return {
        async parse(markdown: string): Promise<string> {
          const html = await nativeParser(markdown)
          const withMath = renderMathExpressions(html)
          return highlightCodeBlocks(withMath)
        },
      }
    }

    return jsParser
  },
})
