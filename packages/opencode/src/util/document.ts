import { Filesystem } from "./filesystem"
import { Log } from "./log"

export namespace DocumentExtractor {
  const log = Log.create({ service: "document" })

  const DOCUMENT_MIMES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
  ])

  const EXT_MIME: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
  }

  export function supported(mime: string): boolean {
    return DOCUMENT_MIMES.has(mime)
  }

  export function mimeFromExt(filepath: string): string | undefined {
    const idx = filepath.lastIndexOf(".")
    if (idx === -1) return undefined
    const ext = filepath.slice(idx + 1).toLowerCase()
    return EXT_MIME[ext]
  }

  export interface Result {
    text: string
    pages?: number
  }

  export async function extract(filepath: string, mime: string): Promise<Result | undefined> {
    try {
      if (mime === "application/pdf") return await pdf(filepath)
      if (
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime === "application/msword"
      )
        return await docx(filepath)
      if (
        mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime === "application/vnd.ms-excel"
      )
        return await xlsx(filepath)
      if (
        mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        mime === "application/vnd.ms-powerpoint"
      )
        return await pptx(filepath)
      return undefined
    } catch (err) {
      log.error("extraction failed", { filepath, mime, error: err })
      return undefined
    }
  }

  export async function extractFromBuffer(
    input: Buffer | Uint8Array,
    mime: string,
    filename?: string,
  ): Promise<Result | undefined> {
    try {
      if (mime === "application/pdf")
        return await pdfBuffer(input instanceof Uint8Array ? input : new Uint8Array(input))
      const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
      if (
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime === "application/msword"
      )
        return await docxBuffer(buf)
      if (
        mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime === "application/vnd.ms-excel"
      )
        return await xlsxBuffer(buf)
      if (
        mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        mime === "application/vnd.ms-powerpoint"
      )
        return await pptxBuffer(buf)
      return undefined
    } catch (err) {
      log.error("buffer extraction failed", { mime, filename, error: err })
      return undefined
    }
  }

  async function pdf(filepath: string): Promise<Result> {
    const bytes = await Filesystem.readBytes(filepath)
    return pdfBuffer(new Uint8Array(bytes))
  }

  async function pdfBuffer(data: Uint8Array): Promise<Result> {
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse({ data })
    const result = await parser.getText()
    await parser.destroy()
    return { text: result.text.trim(), pages: result.total }
  }

  async function docx(filepath: string): Promise<Result> {
    const buf = await Filesystem.readBytes(filepath)
    return docxBuffer(Buffer.from(buf))
  }

  async function docxBuffer(buf: Buffer): Promise<Result> {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer: buf })
    return { text: result.value.trim() }
  }

  async function xlsx(filepath: string): Promise<Result> {
    const buf = await Filesystem.readBytes(filepath)
    return xlsxBuffer(Buffer.from(buf))
  }

  async function xlsxBuffer(buf: Buffer): Promise<Result> {
    const XLSX = await import("xlsx")
    const wb = XLSX.read(buf, { type: "buffer" })
    const parts: string[] = []
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name]
      if (!sheet) continue
      const csv = XLSX.utils.sheet_to_csv(sheet)
      if (!csv.trim()) continue
      if (wb.SheetNames.length > 1) parts.push(`## Sheet: ${name}\n`)
      parts.push(csv.trim())
    }
    return { text: parts.join("\n\n"), pages: wb.SheetNames.length }
  }

  async function pptx(filepath: string): Promise<Result> {
    const buf = await Filesystem.readBytes(filepath)
    return pptxBuffer(Buffer.from(buf))
  }

  async function pptxBuffer(buf: Buffer): Promise<Result> {
    const { BlobReader, ZipReader, TextWriter } = await import("@zip.js/zip.js")
    const blob = new Blob([new Uint8Array(buf)])
    const reader = new ZipReader(new BlobReader(blob))
    const entries = await reader.getEntries()

    const slides = entries
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.filename))
      .sort((a, b) => {
        const num = (f: string) => parseInt(f.match(/slide(\d+)/)?.[1] ?? "0")
        return num(a.filename) - num(b.filename)
      })

    const parts: string[] = []
    for (const slide of slides) {
      if (!slide.getData) continue
      const xml = await slide.getData(new TextWriter())
      const text = stripXml(xml)
      if (text.trim()) parts.push(text.trim())
    }

    await reader.close()
    return { text: parts.join("\n\n---\n\n"), pages: slides.length }
  }

  function stripXml(xml: string): string {
    // Extract text content from XML, preserving paragraph boundaries
    return xml
      .replace(/<a:p[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }
}
