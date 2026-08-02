import { readFileSync, readdirSync, statSync } from "fs"
import { join, extname, basename } from "path"

export interface AssetInfo {
  name: string
  path: string
  type: "icon" | "font" | "audio" | "image"
  size: number
  format: string
  optimized?: boolean
  metadata?: Record<string, any>
}

export interface OptimizedAsset extends AssetInfo {
  originalSize: number
  compressionRatio: number
  optimizations: string[]
}

export interface AssetManifest {
  icons: AssetInfo[]
  fonts: AssetInfo[]
  audio: AssetInfo[]
  images: AssetInfo[]
  totalAssets: number
  totalSize: number
  lastUpdated: string
}

export interface FontValidationResult {
  valid: boolean
  issues: FontIssue[]
  recommendations: string[]
}

export interface FontIssue {
  type: "missing_weights" | "missing_formats" | "large_file" | "unused_glyphs"
  message: string
  severity: "error" | "warning" | "info"
}

export class AssetManager {
  private assetsPath: string
  private manifest: AssetManifest | null = null

  constructor(assetsPath: string = join(import.meta.dir, "../assets")) {
    this.assetsPath = assetsPath
  }

  scanAssets(): AssetManifest {
    const manifest: AssetManifest = {
      icons: [],
      fonts: [],
      audio: [],
      images: [],
      totalAssets: 0,
      totalSize: 0,
      lastUpdated: new Date().toISOString(),
    }

    const scanDirectory = (dir: string, type: AssetInfo["type"]) => {
      try {
        const files = readdirSync(dir)
        for (const file of files) {
          const filePath = join(dir, file)
          const stat = statSync(filePath)

          if (stat.isFile()) {
            const assetInfo: AssetInfo = {
              name: basename(file, extname(file)),
              path: filePath,
              type,
              size: stat.size,
              format: extname(file).slice(1),
            }

            switch (type) {
              case "icon":
                manifest.icons.push(assetInfo)
                break
              case "font":
                manifest.fonts.push(assetInfo)
                break
              case "audio":
                manifest.audio.push(assetInfo)
                break
              case "image":
                manifest.images.push(assetInfo)
                break
            }
            manifest.totalAssets++
            manifest.totalSize += stat.size
          }
        }
      } catch (error) {
        console.warn(`Could not scan directory ${dir}:`, error)
      }
    }

    // Scan each asset directory
    scanDirectory(join(this.assetsPath, "icons"), "icon")
    scanDirectory(join(this.assetsPath, "fonts"), "font")
    scanDirectory(join(this.assetsPath, "audio"), "audio")
    scanDirectory(join(this.assetsPath, "images"), "image")

    this.manifest = manifest
    return manifest
  }

  getManifest(): AssetManifest {
    if (!this.manifest) {
      this.scanAssets()
    }
    return this.manifest!
  }

  findAsset(name: string, type?: AssetInfo["type"]): AssetInfo | null {
    const manifest = this.getManifest()

    const searchIn = (assets: AssetInfo[]) => {
      return assets.find((asset) => asset.name === name || asset.name.includes(name)) || null
    }

    if (type) {
      return searchIn(manifest[(type + "s") as keyof AssetManifest] as AssetInfo[])
    }

    // Search all types
    for (const assetType of ["icons", "fonts", "audio", "images"] as const) {
      const found = searchIn(manifest[assetType])
      if (found) return found
    }

    return null
  }

  optimizeIcon(iconName: string): OptimizedAsset | null {
    const asset = this.findAsset(iconName, "icon")
    if (!asset) return null

    // Simulate optimization (in real implementation, this would use SVGO or similar)
    const optimizations: string[] = []
    let compressionRatio = 0

    if (asset.format === "svg") {
      try {
        const content = readFileSync(asset.path, "utf-8")
        const originalSize = content.length

        // Basic SVG optimizations
        let optimized = content
          .replace(/<!--[\s\S]*?-->/g, "") // Remove comments
          .replace(/\s+/g, " ") // Collapse whitespace
          .replace(/>\s+</g, "><") // Remove whitespace between tags

        optimizations.push("Removed comments", "Collapsed whitespace", "Optimized tag spacing")

        const newSize = optimized.length
        compressionRatio = (originalSize - newSize) / originalSize

        return {
          ...asset,
          originalSize,
          compressionRatio,
          optimizations,
          optimized: true,
        }
      } catch (error) {
        console.warn(`Could not optimize icon ${iconName}:`, error)
      }
    }

    return null
  }

  validateFontUsage(): FontValidationResult {
    const manifest = this.getManifest()
    const issues: FontIssue[] = []
    const recommendations: string[] = []

    for (const font of manifest.fonts) {
      // Check font file sizes
      if (font.size > 2 * 1024 * 1024) {
        // 2MB
        issues.push({
          type: "large_file",
          message: `Font ${font.name} is large (${(font.size / 1024 / 1024).toFixed(2)}MB)`,
          severity: "warning",
        })
        recommendations.push("Consider subsetting the font to reduce file size")
      }

      // Check for web font formats
      const webFormats = ["woff2", "woff", "ttf", "eot"]
      if (!webFormats.includes(font.format)) {
        issues.push({
          type: "missing_formats",
          message: `Font ${font.name} uses ${font.format} format, consider web-optimized formats`,
          severity: "info",
        })
        recommendations.push("Use WOFF2 for best compression and browser support")
      }

      // Check for font weights (simplified check)
      if (
        font.name.includes("Regular") &&
        !manifest.fonts.some(
          (f) =>
            f.name.includes("Bold") &&
            f.name.replace("Bold", "").replace("Regular", "") === font.name.replace("Regular", ""),
        )
      ) {
        issues.push({
          type: "missing_weights",
          message: `Font ${font.name} missing bold weight`,
          severity: "info",
        })
      }
    }

    return {
      valid: issues.filter((i) => i.severity === "error").length === 0,
      issues,
      recommendations,
    }
  }

  generateAssetReport(): string {
    const manifest = this.getManifest()
    const fontValidation = this.validateFontUsage()

    let report = "# Design System Asset Report\n\n"
    report += `Generated: ${new Date().toISOString()}\n\n`

    // Summary
    report += "## Summary\n\n"
    report += `- Total Assets: ${manifest.totalAssets}\n`
    report += `- Total Size: ${(manifest.totalSize / 1024 / 1024).toFixed(2)}MB\n\n`

    // By type
    report += "## Assets by Type\n\n"
    for (const type of ["icons", "fonts", "audio", "images"] as const) {
      const assets = manifest[type]
      const typeSize = assets.reduce((sum, asset) => sum + asset.size, 0)
      report += `### ${type.charAt(0).toUpperCase() + type.slice(1)}\n`
      report += `- Count: ${assets.length}\n`
      report += `- Size: ${(typeSize / 1024).toFixed(2)}KB\n`
      report += `- Formats: ${[...new Set(assets.map((a) => a.format))].join(", ")}\n\n`
    }

    // Font validation
    report += "## Font Validation\n\n"
    if (fontValidation.valid) {
      report += "✅ All fonts pass validation\n\n"
    } else {
      report += "❌ Font issues found:\n\n"
      for (const issue of fontValidation.issues) {
        const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️"
        report += `${icon} ${issue.message}\n`
      }
      report += "\n"
    }

    if (fontValidation.recommendations.length > 0) {
      report += "### Recommendations\n\n"
      for (const rec of fontValidation.recommendations) {
        report += `- ${rec}\n`
      }
      report += "\n"
    }

    // Optimization suggestions
    report += "## Optimization Opportunities\n\n"

    const largeIcons = manifest.icons.filter((icon) => icon.size > 1024) // > 1KB
    if (largeIcons.length > 0) {
      report += `### Large Icons (${largeIcons.length})\n\n`
      report += "Consider optimizing these icons:\n"
      for (const icon of largeIcons) {
        report += `- ${icon.name}: ${(icon.size / 1024).toFixed(2)}KB\n`
      }
      if (largeIcons.length > 10) {
        report += `- ... and ${largeIcons.length - 10} more\n`
      }
      report += "\n"
    }

    return report
  }
}

export const assetManager = new AssetManager()

// Utility functions for common asset operations
export function getIconPath(iconName: string): string | null {
  const asset = assetManager.findAsset(iconName, "icon")
  return asset?.path || null
}

export function getFontPath(fontName: string): string | null {
  const asset = assetManager.findAsset(fontName, "font")
  return asset?.path || null
}

export function optimizeAllIcons(): OptimizedAsset[] {
  const manifest = assetManager.getManifest()
  const optimized: OptimizedAsset[] = []

  for (const icon of manifest.icons) {
    const result = assetManager.optimizeIcon(icon.name)
    if (result) {
      optimized.push(result)
    }
  }

  return optimized
}
