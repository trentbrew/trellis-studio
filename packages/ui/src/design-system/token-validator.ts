import type { HexColor, CssVarRef, ThemeToken, TokenCategory } from "../theme/types"

export interface ValidationResult {
  valid: boolean
  violations: TokenViolation[]
  suggestions: string[]
}

export interface TokenViolation {
  type: "hardcoded_value" | "invalid_token" | "semantic_mismatch" | "deprecated_token"
  line?: number
  column?: number
  message: string
  severity: "error" | "warning" | "info"
}

export interface TokenUsage {
  token: string
  category: TokenCategory
  value: string
  context: string
}

// Extracted from theme.css - canonical token list
const CANONICAL_TOKENS = new Set([
  // Typography
  "--font-family-sans", "--font-family-mono", "--font-family-header",
  "--font-size-small", "--font-size-base", "--font-size-large", "--font-size-x-large",
  "--font-weight-regular", "--font-weight-medium",
  "--line-height-normal", "--line-height-large", "--line-height-x-large", "--line-height-2x-large",
  "--letter-spacing-normal", "--letter-spacing-tight", "--letter-spacing-tightest",
  "--paragraph-spacing-base",
  
  // Spacing
  "--spacing",
  
  // Breakpoints
  "--breakpoint-sm", "--breakpoint-md", "--breakpoint-lg", "--breakpoint-xl", "--breakpoint-2xl",
  
  // Containers
  "--container-3xs", "--container-2xs", "--container-xs", "--container-sm",
  "--container-md", "--container-lg", "--container-xl", "--container-2xl",
  "--container-3xl", "--container-4xl",
  
  // Colors (semantic tokens from theme resolution)
  "--color-bg-canvas",
  "--color-bg-chrome",
  "--color-bg-sidebar",
  "--color-bg-panel",
  "--color-bg-well",
  "--color-bg-subtle",
  "--color-bg-elevated",
  "--color-bg-overlay",
  "--color-bg-scrim",
  "--color-canvas",
  "--color-chrome",
  "--color-sidebar",
  "--color-panel",
  "--color-well",
  "--color-subtle",
  "--color-elevated",
  "--color-overlay",
  "--color-scrim",
  "--color-background-base",
  "--color-background-weak",
  "--color-background-strong",
  "--color-background-stronger",
  "--color-surface-base",
  "--color-surface-raised-base",
  "--color-surface-raised-strong",
  "--color-text-base",
  "--color-text-strong",
  "--color-text-weak",
  "--color-border-base",
  "--color-border-strong",
  "--color-border-weaker",
  "--color-icon-base",
  "--color-icon-strong",
  "--color-icon-weak"
])

const DEPRECATED_TOKEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /var\(\s*--background-panel\s*\)/g,
    message: "Deprecated token --background-panel — use var(--bg-panel)",
  },
  {
    pattern: /color-mix\([^)]*var\(\s*--background-base\s*\)/g,
    message: "Avoid color-mix on --background-base for depth — use a --bg-* ladder step",
  },
]

const LEGACY_CLASS_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\bbg-background-panel\b/g,
    message: "Deprecated class bg-background-panel — use bg-panel",
  },
]

const HARDCODED_PATTERNS = [
  // Colors
  /#[0-9a-fA-F]{3,6}\b/g,
  /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g,
  /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/g,
  // Spacing
  /\d+px\b/g,
  /\d+rem\b/g,
  /\d+em\b/g,
]

export class TokenValidator {
  private tokenCache = new Map<string, TokenUsage>()
  
  validateCSS(css: string): ValidationResult {
    const violations: TokenViolation[] = []
    const suggestions: string[] = []
    
    // Deprecated elevation tokens (149c)
    for (const { pattern, message } of [...DEPRECATED_TOKEN_PATTERNS, ...LEGACY_CLASS_PATTERNS]) {
      const matches = css.matchAll(pattern)
      for (const match of matches) {
        const line = this.getLineNumber(css, match.index!)
        violations.push({
          type: "deprecated_token",
          line,
          column: match.index! - css.lastIndexOf("\n", match.index! - 1),
          message,
          severity: "warning",
        })
        suggestions.push(message)
      }
    }

    // Check for hardcoded values
    for (const pattern of HARDCODED_PATTERNS) {
      const matches = css.matchAll(pattern)
      for (const match of matches) {
        const line = this.getLineNumber(css, match.index!)
        violations.push({
          type: "hardcoded_value",
          line,
          column: match.index! - css.lastIndexOf('\n', match.index! - 1),
          message: `Hardcoded value found: ${match[0]}. Use design token instead.`,
          severity: "warning"
        })
        
        // Suggest alternatives
        if (match[0].includes('#')) {
          suggestions.push("Consider using semantic color tokens like --color-text-base or --color-background-base")
        } else if (match[0].includes('px')) {
          suggestions.push("Consider using spacing tokens like --spacing or container tokens")
        }
      }
    }
    
    // Check for invalid tokens
    const tokenMatches = css.matchAll(/var\(--([^)]+)\)/g)
    for (const match of tokenMatches) {
      const tokenName = `--${match[1]}`
      if (!CANONICAL_TOKENS.has(tokenName)) {
        const line = this.getLineNumber(css, match.index!)
        violations.push({
          type: "invalid_token",
          line,
          column: match.index! - css.lastIndexOf('\n', match.index! - 1),
          message: `Invalid or unknown token: ${tokenName}`,
          severity: "error"
        })
      }
    }
    
    return {
      valid: violations.filter(v => v.severity === "error").length === 0,
      violations,
      suggestions
    }
  }
  
  validateComponent(component: string, props: Record<string, any>): ValidationResult {
    const violations: TokenViolation[] = []
    const suggestions: string[] = []
    
    // Check prop values for hardcoded styles
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        for (const pattern of HARDCODED_PATTERNS) {
          if (pattern.test(value)) {
            violations.push({
              type: "hardcoded_value",
              message: `Component prop "${key}" has hardcoded value: ${value}`,
              severity: "warning"
            })
            suggestions.push(`Use design token for prop "${key}" instead of hardcoded value`)
          }
        }
      }
    }
    
    return {
      valid: violations.filter(v => v.severity === "error").length === 0,
      violations,
      suggestions
    }
  }
  
  getTokenUsage(context: string): TokenUsage[] {
    return Array.from(this.tokenCache.values()).filter(usage => 
      usage.context.includes(context)
    )
  }
  
  private getLineNumber(text: string, index: number): number {
    const lines = text.substring(0, index).split('\n')
    return lines.length
  }
}

export const tokenValidator = new TokenValidator()

// Middleware function for automatic validation
export function validateTokens(content: string, context: string): ValidationResult {
  if (context.includes('.css') || context.includes('style')) {
    return tokenValidator.validateCSS(content)
  } else if (context.includes('component') || context.includes('ui')) {
    // Try to parse as component props
    try {
      const props = JSON.parse(content)
      return tokenValidator.validateComponent(context, props)
    } catch {
      // Fallback to CSS validation for inline styles
      return tokenValidator.validateCSS(content)
    }
  }
  
  return { valid: true, violations: [], suggestions: [] }
}
