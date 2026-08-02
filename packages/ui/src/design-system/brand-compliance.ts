export interface BrandViolation {
  type: "naming" | "voice" | "metaphor" | "style" | "emoji"
  severity: "error" | "warning" | "info"
  line?: number
  column?: number
  message: string
  suggestion: string
}

export interface BrandResult {
  compliant: boolean
  violations: BrandViolation[]
  score: number // 0-100 compliance score
  summary: string
}

export interface ContentContext {
  type: "ui" | "docs" | "marketing" | "code" | "blog" | "reference"
  audience: "internal" | "user-facing" | "technical"
  medium: "text" | "code" | "markdown" | "html"
}

// Brand naming rules from BRAND.md
const BRAND_NAMES = {
  ENGINE: "Trellis",
  WORKSPACE: "Trellis Studio",
  INTERNAL: "turtlecode",
}

const DEPRECATED_NAMES = ["Trellis IDE", "TurtleCode IDE", "OpenCode IDE"]

const VOICE_RULES = {
  NO_EM_DASHES: /—/g,
  NO_EMOJI: /[\p{Emoji}]/gu,
  CORPORATE_SPEAK: /\b(synergy|leverage|paradigm|revolutionary|cutting-edge|game-changing)\b/gi,
  BOMBASTIC: /\b(unparalleled|ultimate|best-in-class|market-leading|world-class)\b/gi,
}

const METAPHOR_RULES = {
  TRELLIS_WORDS: /\b(trellis|vine|garden|grow|structure|grid|framework)\b/gi,
  TECH_TERMS: /\b(api|endpoint|database|query|schema|entity|attribute)\b/gi,
}

export class BrandComplianceChecker {
  private violations: BrandViolation[] = []

  check(content: string, context: ContentContext): BrandResult {
    this.violations = []

    // 1. Naming convention checks
    this.checkNaming(content, context)

    // 2. Voice and style checks
    this.checkVoice(content, context)

    // 3. Metaphor usage checks
    this.checkMetaphorUsage(content, context)

    // 4. Emoji and style checks
    this.checkStyle(content, context)

    const score = this.calculateScore()
    const summary = this.generateSummary(context)

    return {
      compliant: this.violations.filter((v) => v.severity === "error").length === 0,
      violations: this.violations,
      score,
      summary,
    }
  }

  private checkNaming(content: string, context: ContentContext): void {
    // Check for deprecated names in user-facing content
    if (context.audience === "user-facing") {
      for (const deprecated of DEPRECATED_NAMES) {
        const regex = new RegExp(deprecated, "gi")
        const matches = content.matchAll(regex)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          this.violations.push({
            type: "naming",
            severity: "error",
            line,
            column: match.index! - content.lastIndexOf("\n", match.index! - 1),
            message: `Deprecated name "${match[0]}" found`,
            suggestion: this.getNamingSuggestion(match[0]),
          })
        }
      }

      // Check for internal name "turtlecode" in user-facing content
      const turtlecodeMatches = content.matchAll(/turtlecode/gi)
      for (const match of turtlecodeMatches) {
        const line = this.getLineNumber(content, match.index!)
        this.violations.push({
          type: "naming",
          severity: "warning",
          line,
          column: match.index! - content.lastIndexOf("\n", match.index! - 1),
          message: `Internal name "turtlecode" in user-facing content`,
          suggestion: 'Use "Trellis Studio" for user-facing content',
        })
      }
    }

    // Ensure proper usage of brand names
    if (content.includes("Trellis") && !content.includes("Trellis Studio") && context.audience === "user-facing") {
      this.violations.push({
        type: "naming",
        severity: "info",
        message: 'Consider using "Trellis Studio" for workspace references',
        suggestion: 'Use "Trellis Studio" when referring to the workspace/UI surface',
      })
    }
  }

  private checkVoice(content: string, context: ContentContext): void {
    // Skip voice checks for code/reference content
    if (context.type === "code" || context.type === "reference") return

    // Check for em-dashes
    const emDashMatches = content.matchAll(VOICE_RULES.NO_EM_DASHES)
    for (const match of emDashMatches) {
      const line = this.getLineNumber(content, match.index!)
      this.violations.push({
        type: "voice",
        severity: "warning",
        line,
        column: match.index! - content.lastIndexOf("\n", match.index! - 1),
        message: "Em-dash found",
        suggestion: "Replace with comma, parentheses, colon, or new sentence",
      })
    }

    // Check for emoji in shipped content
    const emojiMatches = content.matchAll(VOICE_RULES.NO_EMOJI)
    for (const match of emojiMatches) {
      const line = this.getLineNumber(content, match.index!)
      this.violations.push({
        type: "emoji",
        severity: "warning",
        line,
        column: match.index! - content.lastIndexOf("\n", match.index! - 1),
        message: "Emoji found in content",
        suggestion: "Remove emoji unless explicitly requested by user",
      })
    }

    // Check for corporate speak
    const corporateMatches = content.matchAll(VOICE_RULES.CORPORATE_SPEAK)
    for (const match of corporateMatches) {
      const line = this.getLineNumber(content, match.index!)
      this.violations.push({
        type: "voice",
        severity: "info",
        line,
        column: match.index! - content.lastIndexOf("\n", match.index! - 1),
        message: `Corporate speak: "${match[0]}"`,
        suggestion: "Use plainspoken, technical language instead",
      })
    }

    // Check for bombastic language
    const bombasticMatches = content.matchAll(VOICE_RULES.BOMBASTIC)
    for (const match of bombasticMatches) {
      const line = this.getLineNumber(content, match.index!)
      this.violations.push({
        type: "voice",
        severity: "info",
        line,
        column: match.index! - content.lastIndexOf("\n", match.index! - 1),
        message: `Bombastic language: "${match[0]}"`,
        suggestion: "Use confident but measured language",
      })
    }
  }

  private checkMetaphorUsage(content: string, context: ContentContext): void {
    const hasMetaphor = METAPHOR_RULES.TRELLIS_WORDS.test(content)
    const hasTechTerms = METAPHOR_RULES.TECH_TERMS.test(content)

    // UI and reference content should be concrete, no metaphor
    if (context.type === "ui" || context.type === "reference") {
      if (hasMetaphor) {
        this.violations.push({
          type: "metaphor",
          severity: "warning",
          message: "Metaphor found in UI/reference content",
          suggestion: "Remove trellis/vine metaphor from tooltips and reference docs",
        })
      }
    }

    // Marketing and blog content should use metaphor
    if (context.type === "marketing" || context.type === "blog") {
      if (!hasMetaphor && content.length > 100) {
        // Only check substantial content
        this.violations.push({
          type: "metaphor",
          severity: "info",
          message: "No trellis metaphor found in marketing/blog content",
          suggestion: "Add trellis/vine/garden metaphor for brand identity",
        })
      }
    }
  }

  private checkStyle(content: string, context: ContentContext): void {
    // Check for general style issues
    if (context.type === "docs" || context.type === "blog") {
      // Check for sentence length (very long sentences)
      const sentences = content.split(/[.!?]+/)
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim()
        if (sentence.length > 200) {
          this.violations.push({
            type: "style",
            severity: "info",
            message: `Very long sentence (${sentence.length} chars)`,
            suggestion: "Consider breaking up long sentences for readability",
          })
        }
      }
    }
  }

  private getNamingSuggestion(deprecated: string): string {
    const suggestions: Record<string, string> = {
      "Trellis IDE": "Trellis Studio",
      "TurtleCode IDE": "Trellis Studio",
      "OpenCode IDE": "Trellis Studio",
    }
    return suggestions[deprecated] || "Use proper brand naming conventions"
  }

  private getLineNumber(text: string, index: number): number {
    const lines = text.substring(0, index).split("\n")
    return lines.length
  }

  private calculateScore(): number {
    if (this.violations.length === 0) return 100

    const errorWeight = 10
    const warningWeight = 5
    const infoWeight = 1

    const totalDeductions = this.violations.reduce((sum, v) => {
      switch (v.severity) {
        case "error":
          return sum + errorWeight
        case "warning":
          return sum + warningWeight
        case "info":
          return sum + infoWeight
      }
    }, 0)

    return Math.max(0, 100 - totalDeductions)
  }

  private generateSummary(context: ContentContext): string {
    const errorCount = this.violations.filter((v) => v.severity === "error").length
    const warningCount = this.violations.filter((v) => v.severity === "warning").length
    const infoCount = this.violations.filter((v) => v.severity === "info").length

    let summary = `Brand compliance check for ${context.type} content: `

    if (errorCount === 0 && warningCount === 0 && infoCount === 0) {
      summary += "✅ Fully compliant"
    } else {
      const issues = []
      if (errorCount > 0) issues.push(`${errorCount} errors`)
      if (warningCount > 0) issues.push(`${warningCount} warnings`)
      if (infoCount > 0) issues.push(`${infoCount} suggestions`)

      summary += `❌ ${issues.join(", ")}`
    }

    return summary
  }

  // Auto-correction for common issues
  autoCorrect(content: string, context: ContentContext): { corrected: string; changes: string[] } {
    let corrected = content
    const changes: string[] = []

    // Auto-fix deprecated names
    if (context.audience === "user-facing") {
      for (const deprecated of DEPRECATED_NAMES) {
        const regex = new RegExp(deprecated, "gi")
        if (regex.test(corrected)) {
          corrected = corrected.replace(regex, "Trellis Studio")
          changes.push(`Replaced "${deprecated}" with "Trellis Studio"`)
        }
      }
    }

    // Auto-fix em-dashes
    const emDashRegex = /—/g
    if (emDashRegex.test(corrected)) {
      corrected = corrected.replace(emDashRegex, "--")
      changes.push("Replaced em-dashes with double dashes")
    }

    // Auto-fix emoji (remove them)
    const emojiRegex = /[\p{Emoji}]/gu
    if (emojiRegex.test(corrected) && context.type !== "code") {
      corrected = corrected.replace(emojiRegex, "")
      changes.push("Removed emoji")
    }

    return { corrected, changes }
  }
}

export const brandComplianceChecker = new BrandComplianceChecker()

// Convenience functions for common use cases
export function validateUserFacingContent(content: string, type: ContentContext["type"] = "docs"): BrandResult {
  return brandComplianceChecker.check(content, {
    type,
    audience: "user-facing",
    medium: "text",
  })
}

export function validateInternalContent(content: string, type: ContentContext["type"] = "code"): BrandResult {
  return brandComplianceChecker.check(content, {
    type,
    audience: "internal",
    medium: type === "code" ? "code" : "text",
  })
}

export function validateMarketingContent(content: string): BrandResult {
  return brandComplianceChecker.check(content, {
    type: "marketing",
    audience: "user-facing",
    medium: "text",
  })
}
