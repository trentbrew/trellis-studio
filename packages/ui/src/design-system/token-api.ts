import type { ThemeToken, TokenCategory, HexColor, CssVarRef } from "../theme/types"

export interface TokenValue {
  token: string
  category: TokenCategory
  value: string
  cssVar: string
  description?: string
  usage?: string[]
}

export interface TokenDictionary {
  tokens: Record<string, TokenValue>
  categories: Record<TokenCategory, TokenValue[]>
  metadata: {
    totalTokens: number
    lastUpdated: string
    version: string
  }
}

export interface TokenQuery {
  category?: TokenCategory
  pattern?: string
  usage?: string
}

// Canonical token definitions extracted from theme.css
const CANONICAL_TOKENS: Record<string, TokenValue> = {
  // Typography
  "--font-family-sans": {
    token: "--font-family-sans",
    category: "typography",
    value: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    cssVar: "var(--font-family-sans)",
    description: "Primary sans-serif font stack",
    usage: ["body text", "ui elements", "paragraphs"]
  },
  "--font-family-mono": {
    token: "--font-family-mono",
    category: "typography", 
    value: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
    cssVar: "var(--font-family-mono)",
    description: "Monospace font stack for code",
    usage: ["code", "terminal", "monospace text"]
  },
  "--font-family-header": {
    token: "--font-family-header",
    category: "typography",
    value: "\"Berkley Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
    cssVar: "var(--font-family-header)",
    description: "Header font with Berkley Mono",
    usage: ["headers", "wordmarks", "brand elements"]
  },
  "--font-size-small": {
    token: "--font-size-small",
    category: "typography",
    value: "13px",
    cssVar: "var(--font-size-small)",
    description: "Small font size for metadata and captions",
    usage: ["metadata", "captions", "small text"]
  },
  "--font-size-base": {
    token: "--font-size-base",
    category: "typography",
    value: "14px",
    cssVar: "var(--font-size-base)",
    description: "Base font size for body text",
    usage: ["body text", "default text"]
  },
  "--font-size-large": {
    token: "--font-size-large",
    category: "typography",
    value: "16px",
    cssVar: "var(--font-size-large)",
    description: "Large font size for section leads",
    usage: ["section headers", "lead text"]
  },
  "--font-size-x-large": {
    token: "--font-size-x-large",
    category: "typography",
    value: "20px",
    cssVar: "var(--font-size-x-large)",
    description: "Extra large font size for hero text",
    usage: ["hero text", "large headers"]
  },
  "--font-weight-regular": {
    token: "--font-weight-regular",
    category: "typography",
    value: "400",
    cssVar: "var(--font-weight-regular)",
    description: "Regular font weight",
    usage: ["body text", "normal text"]
  },
  "--font-weight-medium": {
    token: "--font-weight-medium",
    category: "typography",
    value: "500",
    cssVar: "var(--font-weight-medium)",
    description: "Medium font weight",
    usage: ["semibold text", "emphasis"]
  },
  "--line-height-normal": {
    token: "--line-height-normal",
    category: "typography",
    value: "130%",
    cssVar: "var(--line-height-normal)",
    description: "Normal line height",
    usage: ["body text", "normal paragraphs"]
  },
  "--line-height-large": {
    token: "--line-height-large",
    category: "typography",
    value: "150%",
    cssVar: "var(--line-height-large)",
    description: "Large line height",
    usage: ["large text", "headings"]
  },
  "--line-height-x-large": {
    token: "--line-height-x-large",
    category: "typography",
    value: "180%",
    cssVar: "var(--line-height-x-large)",
    description: "Extra large line height",
    usage: ["hero text", "very large text"]
  },
  "--line-height-2x-large": {
    token: "--line-height-2x-large",
    category: "typography",
    value: "200%",
    cssVar: "var(--line-height-2x-large)",
    description: "Double line height",
    usage: ["special cases", "display text"]
  },
  "--letter-spacing-normal": {
    token: "--letter-spacing-normal",
    category: "typography",
    value: "0",
    cssVar: "var(--letter-spacing-normal)",
    description: "Normal letter spacing",
    usage: ["default text"]
  },
  "--letter-spacing-tight": {
    token: "--letter-spacing-tight",
    category: "typography",
    value: "-0.1599999964237213",
    cssVar: "var(--letter-spacing-tight)",
    description: "Tight letter spacing",
    usage: ["compact text", "headers"]
  },
  "--letter-spacing-tightest": {
    token: "--letter-spacing-tightest",
    category: "typography",
    value: "-0.3199999928474426",
    cssVar: "var(--letter-spacing-tightest)",
    description: "Very tight letter spacing",
    usage: ["very compact text", "special cases"]
  },
  "--paragraph-spacing-base": {
    token: "--paragraph-spacing-base",
    category: "typography",
    value: "0",
    cssVar: "var(--paragraph-spacing-base)",
    description: "Base paragraph spacing",
    usage: ["paragraphs", "text blocks"]
  },
  
  // Spacing
  "--spacing": {
    token: "--spacing",
    category: "spacing",
    value: "0.25rem",
    cssVar: "var(--spacing)",
    description: "Base spacing unit (4px)",
    usage: ["all spacing calculations", "grid systems"]
  },
  
  // Breakpoints
  "--breakpoint-sm": {
    token: "--breakpoint-sm",
    category: "layout",
    value: "40rem",
    cssVar: "var(--breakpoint-sm)",
    description: "Small breakpoint (640px)",
    usage: ["responsive design", "media queries"]
  },
  "--breakpoint-md": {
    token: "--breakpoint-md",
    category: "layout",
    value: "48rem",
    cssVar: "var(--breakpoint-md)",
    description: "Medium breakpoint (768px)",
    usage: ["responsive design", "media queries"]
  },
  "--breakpoint-lg": {
    token: "--breakpoint-lg",
    category: "layout",
    value: "64rem",
    cssVar: "var(--breakpoint-lg)",
    description: "Large breakpoint (1024px)",
    usage: ["responsive design", "media queries"]
  },
  "--breakpoint-xl": {
    token: "--breakpoint-xl",
    category: "layout",
    value: "80rem",
    cssVar: "var(--breakpoint-xl)",
    description: "Extra large breakpoint (1280px)",
    usage: ["responsive design", "media queries"]
  },
  "--breakpoint-2xl": {
    token: "--breakpoint-2xl",
    category: "layout",
    value: "96rem",
    cssVar: "var(--breakpoint-2xl)",
    description: "2X large breakpoint (1536px)",
    usage: ["responsive design", "media queries"]
  },
  
  // Container sizes
  "--container-3xs": {
    token: "--container-3xs",
    category: "layout",
    value: "16rem",
    cssVar: "var(--container-3xs)",
    description: "Extra extra small container (256px)",
    usage: ["small components", "compact layouts"]
  },
  "--container-2xs": {
    token: "--container-2xs",
    category: "layout",
    value: "18rem",
    cssVar: "var(--container-2xs)",
    description: "Extra small container (288px)",
    usage: ["small components", "compact layouts"]
  },
  "--container-xs": {
    token: "--container-xs",
    category: "layout",
    value: "20rem",
    cssVar: "var(--container-xs)",
    description: "Small container (320px)",
    usage: ["small components", "mobile layouts"]
  },
  "--container-sm": {
    token: "--container-sm",
    category: "layout",
    value: "24rem",
    cssVar: "var(--container-sm)",
    description: "Small medium container (384px)",
    usage: ["components", "content areas"]
  },
  "--container-md": {
    token: "--container-md",
    category: "layout",
    value: "28rem",
    cssVar: "var(--container-md)",
    description: "Medium container (448px)",
    usage: ["content areas", "forms"]
  },
  "--container-lg": {
    token: "--container-lg",
    category: "layout",
    value: "32rem",
    cssVar: "var(--container-lg)",
    description: "Large container (512px)",
    usage: ["main content", "articles"]
  },
  "--container-xl": {
    token: "--container-xl",
    category: "layout",
    value: "36rem",
    cssVar: "var(--container-xl)",
    description: "Extra large container (576px)",
    usage: ["wide content", "large articles"]
  },
  "--container-2xl": {
    token: "--container-2xl",
    category: "layout",
    value: "42rem",
    cssVar: "var(--container-2xl)",
    description: "2X large container (672px)",
    usage: ["very wide content", "desktop layouts"]
  },
  "--container-3xl": {
    token: "--container-3xl",
    category: "layout",
    value: "48rem",
    cssVar: "var(--container-3xl)",
    description: "3X large container (768px)",
    usage: ["very wide content", "large desktop"]
  },
  "--container-4xl": {
    token: "--container-4xl",
    category: "layout",
    value: "56rem",
    cssVar: "var(--container-4xl)",
    description: "4X large container (896px)",
    usage: ["maximum content width", "hero sections"]
  }
}

export class DesignTokenAPI {
  private tokenDictionary: TokenDictionary | null = null
  
  constructor() {
    this.buildDictionary()
  }
  
  private buildDictionary(): TokenDictionary {
    const tokens = { ...CANONICAL_TOKENS }
    const categories: Record<TokenCategory, TokenValue[]> = {
      background: [],
      surface: [],
      text: [],
      border: [],
      icon: [],
      input: [],
      button: [],
      syntax: [],
      markdown: [],
      diff: [],
      avatar: [],
      typography: [],
      spacing: [],
      layout: []
    }
    
    // Organize tokens by category
    for (const token of Object.values(tokens)) {
      if (categories[token.category]) {
        categories[token.category].push(token)
      }
    }
    
    this.tokenDictionary = {
      tokens,
      categories,
      metadata: {
        totalTokens: Object.keys(tokens).length,
        lastUpdated: new Date().toISOString(),
        version: "1.0.0"
      }
    }
    
    return this.tokenDictionary
  }
  
  getToken(tokenName: string): TokenValue | null {
    const dict = this.getDictionary()
    return dict.tokens[tokenName] || null
  }
  
  getTokensByCategory(category: TokenCategory): TokenValue[] {
    const dict = this.getDictionary()
    return dict.categories[category] || []
  }
  
  queryTokens(query: TokenQuery): TokenValue[] {
    const dict = this.getDictionary()
    let tokens = Object.values(dict.tokens)
    
    if (query.category) {
      tokens = tokens.filter(token => token.category === query.category)
    }
    
    if (query.pattern) {
      const pattern = new RegExp(query.pattern, "i")
      tokens = tokens.filter(token => 
        pattern.test(token.token) || 
        pattern.test(token.description || "") ||
        pattern.test(token.usage?.join(" ") || "")
      )
    }
    
    if (query.usage) {
      tokens = tokens.filter(token => 
        token.usage?.some(usage => usage.includes(query.usage!))
      )
    }
    
    return tokens
  }
  
  findTokensForUsage(usage: string): TokenValue[] {
    return this.queryTokens({ usage })
  }
  
  generateCSSVariables(category?: TokenCategory): string {
    const tokens = category ? this.getTokensByCategory(category) : Object.values(this.getDictionary().tokens)
    
    return tokens
      .map(token => `  ${token.token}: ${token.value};`)
      .join("\n")
  }
  
  generateTokenDictionary(): TokenDictionary {
    return this.getDictionary()
  }
  
  validateToken(tokenName: string): boolean {
    return this.getToken(tokenName) !== null
  }
  
  suggestTokens(context: string): TokenValue[] {
    // Simple context-based token suggestions
    const contextLower = context.toLowerCase()
    const suggestions: TokenValue[] = []
    
    if (contextLower.includes("font") || contextLower.includes("text")) {
      suggestions.push(...this.getTokensByCategory("typography"))
    }
    
    if (contextLower.includes("spacing") || contextLower.includes("margin") || contextLower.includes("padding")) {
      suggestions.push(this.getToken("--spacing")!)
    }
    
    if (contextLower.includes("breakpoint") || contextLower.includes("responsive")) {
      suggestions.push(...this.getTokensByCategory("layout").filter(t => t.token.includes("breakpoint")))
    }
    
    if (contextLower.includes("container") || contextLower.includes("width")) {
      suggestions.push(...this.getTokensByCategory("layout").filter(t => t.token.includes("container")))
    }
    
    return suggestions
  }
  
  private getDictionary(): TokenDictionary {
    if (!this.tokenDictionary) {
      this.buildDictionary()
    }
    return this.tokenDictionary!
  }
}

export const designTokenAPI = new DesignTokenAPI()

// Convenience functions for common operations
export function getToken(tokenName: string): TokenValue | null {
  return designTokenAPI.getToken(tokenName)
}

export function getTypographyTokens(): TokenValue[] {
  return designTokenAPI.getTokensByCategory("typography")
}

export function getSpacingTokens(): TokenValue[] {
  return designTokenAPI.getTokensByCategory("spacing")
}

export function getLayoutTokens(): TokenValue[] {
  return designTokenAPI.getTokensByCategory("layout")
}

export function findTokensForUsage(usage: string): TokenValue[] {
  return designTokenAPI.findTokensForUsage(usage)
}

export function generateCSSForCategory(category: TokenCategory): string {
  return designTokenAPI.generateCSSVariables(category)
}

export function validateTokenUsage(tokenName: string): boolean {
  return designTokenAPI.validateToken(tokenName)
}
