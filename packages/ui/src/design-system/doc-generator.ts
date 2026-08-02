import { designTokenAPI, type TokenDictionary } from "./token-api"
import { assetManager, type AssetManifest } from "./asset-manager"
import { brandComplianceChecker } from "./brand-compliance"

export interface DocumentationConfig {
  includeTokens: boolean
  includeAssets: boolean
  includeBrand: boolean
  format: "markdown" | "html" | "json"
  outputPath?: string
}

export interface GeneratedDocs {
  overview: string
  tokens: string
  assets: string
  brand: string
  examples: string
  fullDocument: string
}

export class DocumentationGenerator {
  private config: DocumentationConfig
  
  constructor(config: DocumentationConfig = {
    includeTokens: true,
    includeAssets: true,
    includeBrand: true,
    format: "markdown"
  }) {
    this.config = config
  }
  
  generateDocumentation(): GeneratedDocs {
    const docs: GeneratedDocs = {
      overview: this.generateOverview(),
      tokens: this.config.includeTokens ? this.generateTokenDocs() : "",
      assets: this.config.includeAssets ? this.generateAssetDocs() : "",
      brand: this.config.includeBrand ? this.generateBrandDocs() : "",
      examples: this.generateExamples(),
      fullDocument: ""
    }
    
    // Combine all sections
    docs.fullDocument = this.combineSections(docs)
    
    return docs
  }
  
  private generateOverview(): string {
    const date = new Date().toISOString().split("T")[0]
    
    return `# Trellis Studio Design System Documentation

> Generated on ${date}

## Overview

This document describes the complete design system for Trellis Studio, including design tokens, assets, brand guidelines, and usage patterns.

## Architecture

The design system is built on three core pillars:

1. **Design Tokens** - Semantic variables for colors, typography, spacing, and layout
2. **Asset Management** - Optimized icons, fonts, and media assets
3. **Brand Compliance** - Guidelines for consistent voice and naming

## Getting Started

### Using Design Tokens

\`\`\`css
/* Import the theme CSS */
@import "@opencode-ai/ui/styles/theme.css";

/* Use tokens in your CSS */
.my-component {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  color: var(--color-text-base);
  background: var(--color-surface-base);
  padding: calc(var(--spacing) * 2);
}
\`\`\`

### Using Assets

\`\`\`typescript
import { getIconPath } from "@opencode-ai/ui/design-system/asset-manager"

// Get icon path
const iconPath = getIconPath("chevron-right")
\`\`\`

### Brand Compliance

\`\`\`typescript
import { validateUserFacingContent } from "@opencode-ai/ui/design-system/brand-compliance"

// Check content compliance
const result = validateUserFacingContent(content, "docs")
if (!result.compliant) {
  console.log(result.violations)
}
\`\`\`

---

`
  }
  
  private generateTokenDocs(): string {
    const dictionary = designTokenAPI.generateTokenDictionary()
    
    let docs = `## Design Tokens

Design tokens are the atomic design decisions that make up our visual language. They are organized into semantic categories and can be used across all platforms.

### Token Categories

`
    
    // Generate category sections
    for (const [category, tokens] of Object.entries(dictionary.categories)) {
      if (tokens.length === 0) continue
      
      docs += `#### ${category.charAt(0).toUpperCase() + category.slice(1)} (${tokens.length} tokens)

`
      
      for (const token of tokens) {
        docs += `**${token.token}**
- **Value**: \`${token.value}\`
- **CSS Variable**: \`${token.cssVar}\`
- **Usage**: ${token.usage?.join(", ") || "General use"}
`
        
        if (token.description) {
          docs += `- **Description**: ${token.description}\n`
        }
        
        docs += "\n"
      }
      
      docs += "\n"
    }
    
    // Add CSS reference
    docs += `### Complete CSS Reference

\`\`\`css
${designTokenAPI.generateCSSVariables()}
\`\`\`

`
    
    return docs
  }
  
  private generateAssetDocs(): string {
    const manifest = assetManager.getManifest()
    const fontValidation = assetManager.validateFontUsage()
    
    let docs = `## Assets

### Overview

- **Total Assets**: ${manifest.totalAssets}
- **Total Size**: ${(manifest.totalSize / 1024 / 1024).toFixed(2)}MB
- **Last Updated**: ${manifest.lastUpdated}

### Asset Breakdown

`
    
    for (const type of ["icons", "fonts", "audio", "images"] as const) {
      const assets = manifest[type]
      if (assets.length === 0) continue
      
      const typeSize = assets.reduce((sum, asset) => sum + asset.size, 0)
      const formats = [...new Set(assets.map(a => a.format))]
      
      docs += `#### ${type.charAt(0).toUpperCase() + type.slice(1)} (${assets.length} files, ${(typeSize / 1024).toFixed(1)}KB)

- **Formats**: ${formats.join(", ")}
- **Average Size**: ${(typeSize / assets.length / 1024).toFixed(2)}KB

`
      
      // Show some examples
      if (type === "icons") {
        docs += `**Sample Icons**: ${assets.slice(0, 10).map(a => a.name).join(", ")}
`
        if (assets.length > 10) {
          docs += `... and ${assets.length - 10} more\n`
        }
        docs += "\n"
      }
    }
    
    // Font validation section
    docs += `### Font Validation

`
    if (fontValidation.valid) {
      docs += "✅ All fonts pass validation\n\n"
    } else {
      docs += "❌ Font issues found:\n\n"
      for (const issue of fontValidation.issues) {
        const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️"
        docs += `${icon} ${issue.message}\n`
      }
      docs += "\n"
    }
    
    if (fontValidation.recommendations.length > 0) {
      docs += "### Recommendations\n\n"
      for (const rec of fontValidation.recommendations) {
        docs += `- ${rec}\n`
      }
      docs += "\n"
    }
    
    return docs
  }
  
  private generateBrandDocs(): string {
    return `## Brand Guidelines

### Naming Conventions

| Layer | Name | Usage |
|---|---|---|
| Engine | **Trellis** | npm package, AGPL-3.0 |
| Workspace / UI surface | **Trellis Studio** | User-facing product |
| Internal repo / codename | **turtlecode** | Internal development |

### Voice & Tone

- **Plainspoken**: Technical but accessible
- **Confident**: Without bombast
- **Direct**: Clear and concise

### Style Rules

- **No em-dashes**: Use commas, parentheses, or new sentences
- **No emoji**: In shipped writing unless explicitly requested
- **No corporate speak**: Avoid "synergy", "leverage", "paradigm"
- **No bombastic language**: Avoid "unparalleled", "ultimate", "market-leading"

### Metaphor Usage

| Context | Metaphor | Guidance |
|---|---|---|
| UI/Reference | ❌ No | Keep concrete and technical |
| Marketing/Blog | ✅ Yes | Use trellis/vine/garden imagery |
| Documentation | ⚠️ Limited | Use sparingly for clarity |

### Compliance Checking

Use the brand compliance checker to validate content:

\`\`\`typescript
import { validateUserFacingContent, validateMarketingContent } from "@opencode-ai/ui/design-system/brand-compliance"

// User-facing content
const userResult = validateUserFacingContent(content, "docs")

// Marketing content  
const marketingResult = validateMarketingContent(content)
\`\`\`

### Auto-correction

The brand compliance checker can auto-correct common issues:

\`\`\`typescript
import { brandComplianceChecker } from "@opencode-ai/ui/design-system/brand-compliance"

const { corrected, changes } = brandComplianceChecker.autoCorrect(content, context)
\`\`\`

`
  }
  
  private generateExamples(): string {
    return `## Usage Examples

### Component Styling

\`\`\`tsx
import { Button } from "@opencode-ai/ui/button"

export function MyComponent() {
  return (
    <Button 
      style={{
        fontFamily: "var(--font-family-sans)",
        fontSize: "var(--font-size-base)",
        padding: "calc(var(--spacing) * 2) calc(var(--spacing) * 3)",
        background: "var(--color-surface-raised-base)",
        color: "var(--color-text-base)",
        border: "1px solid var(--color-border-base)"
      }}
    >
      Click me
    </Button>
  )
}
\`\`\`

### Responsive Design

\`\`\`css
.mobile-nav {
  display: none;
}

@media (min-width: 40rem) {
  .mobile-nav {
    display: flex;
    padding: var(--spacing);
  }
}

@media (min-width: 64rem) {
  .mobile-nav {
    max-width: var(--container-lg);
  }
}
\`\`\`

### Typography Scale

\`\`\`css
.text-scale {
  font-family: var(--font-family-sans);
  line-height: var(--line-height-normal);
}

.text-scale--small {
  font-size: var(--font-size-small);
}

.text-scale--base {
  font-size: var(--font-size-base);
}

.text-scale--large {
  font-size: var(--font-size-large);
  line-height: var(--line-height-large);
}

.text-scale--x-large {
  font-size: var(--font-size-x-large);
  line-height: var(--line-height-x-large);
  font-family: var(--font-family-header);
}
\`\`\`

### Icon Usage

\`\`\`tsx
import { Icon } from "@opencode-ai/ui/icon"
import { getIconPath } from "@opencode-ai/ui/design-system/asset-manager"

export function IconExample() {
  return (
    <div>
      <Icon name="chevron-right" size={16} />
      <Icon name="check-circle" size={24} color="var(--color-success)" />
    </div>
  )
}
\`\`\`

### Dark Mode Support

\`\`\`css
.component {
  background: var(--color-surface-base);
  color: var(--color-text-base);
  border: 1px solid var(--color-border-base);
}

@media (prefers-color-scheme: dark) {
  /* Tokens automatically adapt to dark theme */
}
\`\`\`

`
  }
  
  private combineSections(docs: GeneratedDocs): string {
    let combined = docs.overview
    
    if (docs.tokens) combined += docs.tokens + "\n"
    if (docs.assets) combined += docs.assets + "\n"
    if (docs.brand) combined += docs.brand + "\n"
    if (docs.examples) combined += docs.examples + "\n"
    
    // Add footer
    combined += `---

*This documentation was generated automatically by the Trellis Studio Design System.*`

    return combined
  }
  
  saveToFile(path: string): void {
    const docs = this.generateDocumentation()
    
    if (this.config.format === "json") {
      // Save as JSON
      const jsonData = JSON.stringify(docs, null, 2)
      // Implementation would write to file system
    } else {
      // Save as markdown
      // Implementation would write docs.fullDocument to file system
    }
  }
}

export const docGenerator = new DocumentationGenerator()

// Convenience functions
export function generateFullDocumentation(): string {
  return docGenerator.generateDocumentation().fullDocument
}

export function generateTokenDocumentation(): string {
  return docGenerator.generateDocumentation().tokens
}

export function generateAssetDocumentation(): string {
  return docGenerator.generateDocumentation().assets
}

export function generateBrandDocumentation(): string {
  return docGenerator.generateDocumentation().brand
}
