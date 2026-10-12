import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  dropCursor,
  drawSelection,
} from "@codemirror/view"
import {
  HighlightStyle,
  bracketMatching,
  syntaxHighlighting,
  foldGutter,
  indentOnInput,
} from "@codemirror/language"
import { history } from "@codemirror/commands"
import { closeBrackets } from "@codemirror/autocomplete"
import { EditorState, type Extension } from "@codemirror/state"
import { tags as t } from "@lezer/highlight"
import { javascript } from "@codemirror/lang-javascript"
import { go } from "@codemirror/lang-go"
import { python } from "@codemirror/lang-python"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { html } from "@codemirror/lang-html"
import { css } from "@codemirror/lang-css"

export interface LanguageInfo {
  ext: Extension | null
  id: string
}

/**
 * Maps file extension to CodeMirror language extension and LSP language ID.
 */
export function resolveLanguage(filename: string): LanguageInfo {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  switch (ext) {
    case "ts":
      return { ext: javascript({ typescript: true }), id: "typescript" }
    case "tsx":
      return {
        ext: javascript({ typescript: true, jsx: true }),
        id: "typescriptreact",
      }
    case "js":
      return { ext: javascript(), id: "javascript" }
    case "jsx":
      return { ext: javascript({ jsx: true }), id: "javascriptreact" }
    case "go":
      return { ext: go(), id: "go" }
    case "py":
      return { ext: python(), id: "python" }
    case "json":
      return { ext: json(), id: "json" }
    case "md":
    case "markdown":
      return { ext: markdown(), id: "markdown" }
    case "html":
    case "htm":
      return { ext: html(), id: "html" }
    case "css":
      return { ext: css(), id: "css" }
    default:
      return { ext: null, id: "plaintext" }
  }
}

/**
 * Strict AegisCode syntax highlighting style mapped directly to the active theme CSS tokens.
 * Zero fallback to arbitrary themes: automatically adapts across all color palettes and modes.
 */
export const aegisHighlightStyle = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.modifier,
      t.controlKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.operatorKeyword,
    ],
    color: "var(--color-pink)",
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.macroName,
      t.labelName,
    ],
    color: "var(--color-blue)",
  },
  {
    tag: [t.string, t.special(t.string), t.character],
    color: "var(--color-green)",
  },
  {
    tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom],
    color: "var(--color-orange)",
  },
  {
    tag: [t.typeName, t.className, t.standard(t.typeName), t.namespace],
    color: "var(--color-cyan)",
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: "var(--color-ink-muted)",
    fontStyle: "italic",
  },
  {
    tag: [t.propertyName, t.attributeName],
    color: "var(--color-ink)",
  },
  {
    tag: [t.variableName, t.definition(t.variableName), t.self],
    color: "var(--color-ink)",
  },
  {
    tag: [t.operator, t.punctuation, t.bracket, t.paren, t.brace, t.separator],
    color: "var(--color-ink-soft)",
  },
  {
    tag: [t.regexp, t.escape],
    color: "var(--color-pink)",
  },
  {
    tag: [t.invalid, t.deleted],
    color: "var(--color-error)",
  },
  {
    tag: [t.inserted],
    color: "var(--color-success)",
  },
  {
    tag: [t.heading],
    color: "var(--color-blue)",
    fontWeight: "600",
  },
  {
    tag: [t.link],
    color: "var(--color-accent)",
    textDecoration: "underline",
  },
])

/**
 * Creates the base AegisCode editor theme for EditorView and MergeView.
 */
export function createAegisEditorTheme(fontSize = 13.5, lineHeight = 22) {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: `${fontSize}px`,
      backgroundColor: "transparent",
      color: "var(--color-ink)",
      fontFamily:
        "var(--editor-font-family, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace)",
    },
    ".cm-scroller": {
      overflow: "auto",
      lineHeight: `${lineHeight}px`,
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--color-ink-muted)",
      borderRight:
        "1px solid color-mix(in srgb, var(--color-line) 40%, transparent)",
      minWidth: "48px",
      userSelect: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent !important",
      color: "var(--color-ink) !important",
      fontWeight: "700 !important",
    },
    ".cm-activeLine": {
      backgroundColor:
        "color-mix(in srgb, var(--color-ink) 5%, transparent) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--color-ink)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor:
          "color-mix(in srgb, var(--color-accent) 25%, transparent) !important",
      },
    ".cm-line": {
      padding: "0 8px",
    },

    // Diff chunk and change styles
    "&.cm-merge-a .cm-changedLine, .cm-deletedChunk": {
      backgroundColor:
        "color-mix(in srgb, var(--color-error) 15%, transparent) !important",
    },
    "&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine": {
      backgroundColor:
        "color-mix(in srgb, var(--color-success) 15%, transparent) !important",
    },
    ".cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText": {
      backgroundColor:
        "color-mix(in srgb, var(--color-error) 28%, transparent) !important",
      borderRadius: "2px",
    },
    ".cm-merge-b .cm-changedText": {
      backgroundColor:
        "color-mix(in srgb, var(--color-success) 28%, transparent) !important",
      borderRadius: "2px",
    },
    "&.cm-merge-a .cm-changedLineGutter, .cm-deletedLineGutter": {
      backgroundColor: "var(--color-error) !important",
      width: "3px",
    },
    "&.cm-merge-b .cm-changedLineGutter": {
      backgroundColor: "var(--color-success) !important",
      width: "3px",
    },
    ".cm-merge-revert": {
      width: "2em",
      backgroundColor:
        "color-mix(in srgb, var(--color-canvas) 50%, transparent)",
      borderLeft:
        "1px solid color-mix(in srgb, var(--color-line) 40%, transparent)",
      borderRight:
        "1px solid color-mix(in srgb, var(--color-line) 40%, transparent)",
    },
    ".cm-merge-revert button": {
      color: "var(--color-accent)",
      cursor: "pointer",
      opacity: "0.8",
      transition: "opacity 0.15s, transform 0.15s",
      "&:hover": {
        opacity: "1",
        transform: "scale(1.2)",
      },
    },
    ".cm-collapsedLines": {
      padding: "6px 12px",
      fontSize: "11px",
      fontFamily: "var(--editor-font-family, monospace)",
      color: "var(--color-ink-muted)",
      backgroundColor:
        "color-mix(in srgb, var(--color-surface-raised) 70%, transparent)",
      borderTop:
        "1px dashed color-mix(in srgb, var(--color-line) 60%, transparent)",
      borderBottom:
        "1px dashed color-mix(in srgb, var(--color-line) 60%, transparent)",
      cursor: "pointer",
      textAlign: "center",
      userSelect: "none",
      "&:hover": {
        color: "var(--color-accent)",
        backgroundColor:
          "color-mix(in srgb, var(--color-surface-hover) 80%, transparent)",
      },
    },
    ".cm-deletedChunk button": {
      border: "none",
      cursor: "pointer",
      color: "var(--color-canvas)",
      fontWeight: "600",
      padding: "1px 6px",
      fontSize: "10px",
      borderRadius: "3px",
      "&[name=accept]": {
        backgroundColor: "var(--color-success)",
      },
      "&[name=reject]": {
        backgroundColor: "var(--color-error)",
      },
    },
  })
}

export interface BaseEditorExtensionsConfig {
  fontSize?: number
  lineHeight?: number
  tabSize?: number
  wordWrap?: "on" | "off" | "wordWrapColumn"
  showFoldGutter?: boolean
  languageExtension?: Extension | null
}

/**
 * Single Source of Truth builder for core CodeMirror extensions.
 */
export function getBaseEditorExtensions({
  fontSize = 13.5,
  lineHeight = 22,
  tabSize = 2,
  wordWrap = "off",
  showFoldGutter = true,
  languageExtension = null,
}: BaseEditorExtensionsConfig): Extension[] {
  const exts: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    syntaxHighlighting(aegisHighlightStyle),
    EditorState.tabSize.of(tabSize),
    createAegisEditorTheme(fontSize, lineHeight),
  ]

  if (showFoldGutter) {
    exts.push(foldGutter())
  }

  if (wordWrap === "on" || wordWrap === "wordWrapColumn") {
    exts.push(EditorView.lineWrapping)
  }

  if (languageExtension) {
    exts.push(languageExtension)
  }

  return exts
}
