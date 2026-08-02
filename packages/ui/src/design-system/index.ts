// Token validation and compliance
export { TokenValidator, tokenValidator, validateTokens } from "./token-validator"
export type { ValidationResult, TokenViolation, TokenUsage } from "./token-validator"

// Asset management
export { AssetManager, assetManager, optimizeAllIcons, getIconPath, getFontPath } from "./asset-manager"
export type { AssetInfo, OptimizedAsset, AssetManifest, FontValidationResult, FontIssue } from "./asset-manager"

// Brand compliance
export { BrandComplianceChecker, brandComplianceChecker } from "./brand-compliance"
export { validateUserFacingContent, validateInternalContent, validateMarketingContent } from "./brand-compliance"
export type { BrandViolation, BrandResult, ContentContext } from "./brand-compliance"

// Import for internal use
import type { ContentContext } from "./brand-compliance"
import { validateTokens } from "./token-validator"
import { validateUserFacingContent, brandComplianceChecker } from "./brand-compliance"
import { designTokenAPI } from "./token-api"
import { assetManager } from "./asset-manager"

// Design token API
export { DesignTokenAPI, designTokenAPI } from "./token-api"
export {
  getToken,
  getTypographyTokens,
  getSpacingTokens,
  getLayoutTokens,
  findTokensForUsage,
  generateCSSForCategory,
  validateTokenUsage,
} from "./token-api"
export type { TokenValue, TokenDictionary, TokenQuery } from "./token-api"

// Documentation generation
export { DocumentationGenerator, docGenerator } from "./doc-generator"
export {
  generateFullDocumentation,
  generateTokenDocumentation,
  generateAssetDocumentation,
  generateBrandDocumentation,
} from "./doc-generator"
export type { DocumentationConfig, GeneratedDocs } from "./doc-generator"

// Combined validation middleware
export function validateDesignSystem(
  content: string,
  context: ContentContext,
): {
  tokens: ReturnType<typeof validateTokens>
  brand: ReturnType<typeof validateUserFacingContent>
  overall: {
    valid: boolean
    issues: string[]
    suggestions: string[]
  }
} {
  const tokenValidation = validateTokens(content, context.type)
  const brandValidation = brandComplianceChecker.check(content, context)

  const allIssues = [
    ...tokenValidation.violations.map((v) => v.message),
    ...brandValidation.violations.map((v) => v.message),
  ]

  const allSuggestions = [...tokenValidation.suggestions, ...brandValidation.violations.map((v) => v.suggestion)]

  return {
    tokens: tokenValidation,
    brand: brandValidation,
    overall: {
      valid: tokenValidation.valid && brandValidation.compliant,
      issues: allIssues,
      suggestions: allSuggestions,
    },
  }
}

// Quick health check for design system
export function designSystemHealthCheck(): {
  tokens: { available: number; valid: boolean }
  assets: { total: number; size: string; optimized: boolean }
  brand: { guidelinesLoaded: boolean }
} {
  const dictionary = designTokenAPI.generateTokenDictionary()
  const manifest = assetManager.getManifest()

  return {
    tokens: {
      available: dictionary.metadata.totalTokens,
      valid: dictionary.metadata.totalTokens > 0,
    },
    assets: {
      total: manifest.totalAssets,
      size: `${(manifest.totalSize / 1024 / 1024).toFixed(2)}MB`,
      optimized: manifest.totalAssets > 0,
    },
    brand: {
      guidelinesLoaded: true, // Brand rules are compiled in
    },
  }
}
