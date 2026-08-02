import path from "path"
import fs from "fs/promises"
import { describe, expect, test } from "bun:test"
import { DocumentExtractor } from "../../src/util/document"
import { tmpdir } from "../fixture/fixture"

// --- Helpers to create minimal valid document fixtures ---

// Minimal valid PDF
function minimalPdf(text = "Hello from PDF") {
  // Build a proper 1-page PDF with embedded text
  const stream = `BT /F1 12 Tf 100 700 Td (${text}) Tj ET`
  const objects = [
    `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj`,
    `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj`,
    `3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj`,
    `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj`,
  ]
  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  for (const obj of objects) {
    offsets.push(body.length)
    body += obj + "\n"
  }
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) {
    body += `${String(off).padStart(10, "0")} 00000 n \n`
  }
  body += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(body, "utf-8")
}

// Minimal DOCX (zip with word/document.xml)
async function minimalDocx(text = "Hello from DOCX") {
  const { BlobWriter, ZipWriter, TextReader } = await import("@zip.js/zip.js")
  const blob = new BlobWriter()
  const writer = new ZipWriter(blob)
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  await writer.add("[Content_Types].xml", new TextReader(types))
  await writer.add("_rels/.rels", new TextReader(rels))
  await writer.add("word/document.xml", new TextReader(xml))
  await writer.close()
  const result = await (blob as any).getData()
  return Buffer.from(await result.arrayBuffer())
}

// Minimal XLSX via xlsx library (creates a single-sheet workbook)
async function minimalXlsx(data = [["Name", "Age"], ["Alice", "30"]]) {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

// Minimal PPTX (zip with ppt/slides/slide1.xml)
async function minimalPptx(text = "Hello from PPTX") {
  const { BlobWriter, ZipWriter, TextReader } = await import("@zip.js/zip.js")
  const blob = new BlobWriter()
  const writer = new ZipWriter(blob)
  const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  await writer.add("ppt/slides/slide1.xml", new TextReader(slide))
  await writer.close()
  const result = await (blob as any).getData()
  return Buffer.from(await result.arrayBuffer())
}

// --- Tests ---

describe("DocumentExtractor.supported", () => {
  test("recognizes PDF", () => {
    expect(DocumentExtractor.supported("application/pdf")).toBe(true)
  })

  test("recognizes DOCX", () => {
    expect(DocumentExtractor.supported("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true)
  })

  test("recognizes XLSX", () => {
    expect(DocumentExtractor.supported("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true)
  })

  test("recognizes PPTX", () => {
    expect(DocumentExtractor.supported("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(true)
  })

  test("recognizes legacy Office formats", () => {
    expect(DocumentExtractor.supported("application/msword")).toBe(true)
    expect(DocumentExtractor.supported("application/vnd.ms-excel")).toBe(true)
    expect(DocumentExtractor.supported("application/vnd.ms-powerpoint")).toBe(true)
  })

  test("rejects unsupported mimes", () => {
    expect(DocumentExtractor.supported("text/plain")).toBe(false)
    expect(DocumentExtractor.supported("image/png")).toBe(false)
    expect(DocumentExtractor.supported("application/json")).toBe(false)
  })
})

describe("DocumentExtractor.mimeFromExt", () => {
  test("returns correct mime for known extensions", () => {
    expect(DocumentExtractor.mimeFromExt("file.pdf")).toBe("application/pdf")
    expect(DocumentExtractor.mimeFromExt("file.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(DocumentExtractor.mimeFromExt("file.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(DocumentExtractor.mimeFromExt("file.pptx")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation")
    expect(DocumentExtractor.mimeFromExt("file.doc")).toBe("application/msword")
    expect(DocumentExtractor.mimeFromExt("file.xls")).toBe("application/vnd.ms-excel")
    expect(DocumentExtractor.mimeFromExt("file.ppt")).toBe("application/vnd.ms-powerpoint")
  })

  test("returns undefined for unknown extensions", () => {
    expect(DocumentExtractor.mimeFromExt("file.txt")).toBeUndefined()
    expect(DocumentExtractor.mimeFromExt("file.png")).toBeUndefined()
    expect(DocumentExtractor.mimeFromExt("noext")).toBeUndefined()
  })

  test("handles case insensitive extensions", () => {
    expect(DocumentExtractor.mimeFromExt("file.PDF")).toBe("application/pdf")
    expect(DocumentExtractor.mimeFromExt("file.DOCX")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  })
})

describe("DocumentExtractor.extract — PDF", () => {
  test("extracts text from a PDF file", async () => {
    await using tmp = await tmpdir()
    const filepath = path.join(tmp.path, "test.pdf")
    await fs.writeFile(filepath, minimalPdf("Hello from PDF"))

    const result = await DocumentExtractor.extract(filepath, "application/pdf")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Hello from PDF")
    expect(result!.pages).toBe(1)
  })

  test("returns page count", async () => {
    await using tmp = await tmpdir()
    const filepath = path.join(tmp.path, "test.pdf")
    await fs.writeFile(filepath, minimalPdf())

    const result = await DocumentExtractor.extract(filepath, "application/pdf")
    expect(result).toBeDefined()
    expect(typeof result!.pages).toBe("number")
    expect(result!.pages).toBeGreaterThanOrEqual(1)
  })

  test("returns undefined for non-existent file", async () => {
    const result = await DocumentExtractor.extract("/nonexistent/file.pdf", "application/pdf")
    expect(result).toBeUndefined()
  })
})

describe("DocumentExtractor.extractFromBuffer — PDF", () => {
  test("extracts text from a PDF buffer", async () => {
    const buf = minimalPdf("Buffer PDF text")
    const result = await DocumentExtractor.extractFromBuffer(buf, "application/pdf", "test.pdf")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Buffer PDF text")
    expect(result!.pages).toBe(1)
  })

  test("works with Uint8Array input", async () => {
    const buf = minimalPdf("Uint8Array PDF")
    const arr = new Uint8Array(buf)
    const result = await DocumentExtractor.extractFromBuffer(arr, "application/pdf", "test.pdf")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Uint8Array PDF")
  })

  test("returns undefined for corrupt buffer", async () => {
    const buf = Buffer.from("not a pdf at all")
    const result = await DocumentExtractor.extractFromBuffer(buf, "application/pdf", "bad.pdf")
    expect(result).toBeUndefined()
  })
})

describe("DocumentExtractor.extract — XLSX", () => {
  test("extracts CSV from XLSX file", async () => {
    await using tmp = await tmpdir()
    const filepath = path.join(tmp.path, "test.xlsx")
    const buf = await minimalXlsx([["Name", "Age"], ["Alice", "30"], ["Bob", "25"]])
    await fs.writeFile(filepath, buf)

    const result = await DocumentExtractor.extract(filepath, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Name")
    expect(result!.text).toContain("Alice")
    expect(result!.text).toContain("30")
    expect(result!.pages).toBe(1)
  })
})

describe("DocumentExtractor.extractFromBuffer — XLSX", () => {
  test("extracts CSV from XLSX buffer", async () => {
    const buf = await minimalXlsx([["X", "Y"], ["1", "2"]])
    const result = await DocumentExtractor.extractFromBuffer(buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "test.xlsx")
    expect(result).toBeDefined()
    expect(result!.text).toContain("X")
    expect(result!.text).toContain("1")
  })
})

describe("DocumentExtractor.extract — PPTX", () => {
  test("extracts text from PPTX file", async () => {
    await using tmp = await tmpdir()
    const filepath = path.join(tmp.path, "test.pptx")
    const buf = await minimalPptx("Slide content here")
    await fs.writeFile(filepath, buf)

    const result = await DocumentExtractor.extract(filepath, "application/vnd.openxmlformats-officedocument.presentationml.presentation")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Slide content here")
    expect(result!.pages).toBe(1)
  })
})

describe("DocumentExtractor.extractFromBuffer — PPTX", () => {
  test("extracts text from PPTX buffer", async () => {
    const buf = await minimalPptx("Buffer slide text")
    const result = await DocumentExtractor.extractFromBuffer(buf, "application/vnd.openxmlformats-officedocument.presentationml.presentation", "test.pptx")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Buffer slide text")
  })
})

describe("DocumentExtractor.extract — DOCX", () => {
  test("extracts text from DOCX file", async () => {
    await using tmp = await tmpdir()
    const filepath = path.join(tmp.path, "test.docx")
    const buf = await minimalDocx("Document content")
    await fs.writeFile(filepath, buf)

    const result = await DocumentExtractor.extract(filepath, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Document content")
    expect(result!.pages).toBeUndefined()
  })
})

describe("DocumentExtractor.extractFromBuffer — DOCX", () => {
  test("extracts text from DOCX buffer", async () => {
    const buf = await minimalDocx("Buffer doc text")
    const result = await DocumentExtractor.extractFromBuffer(buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "test.docx")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Buffer doc text")
  })
})

describe("DocumentExtractor — unsupported mime", () => {
  test("extract returns undefined for unsupported mime", async () => {
    const result = await DocumentExtractor.extract("/some/file.txt", "text/plain")
    expect(result).toBeUndefined()
  })

  test("extractFromBuffer returns undefined for unsupported mime", async () => {
    const result = await DocumentExtractor.extractFromBuffer(Buffer.from("hello"), "text/plain", "file.txt")
    expect(result).toBeUndefined()
  })
})

describe("DocumentExtractor — base64 round-trip", () => {
  test("PDF survives base64 encode/decode (simulates data: URL pipeline)", async () => {
    const original = minimalPdf("Round trip test")
    const encoded = original.toString("base64")
    const decoded = Buffer.from(encoded, "base64")
    const result = await DocumentExtractor.extractFromBuffer(decoded, "application/pdf", "test.pdf")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Round trip test")
  })

  test("XLSX survives base64 encode/decode", async () => {
    const original = await minimalXlsx([["Data", "Value"], ["test", "42"]])
    const encoded = original.toString("base64")
    const decoded = Buffer.from(encoded, "base64")
    const result = await DocumentExtractor.extractFromBuffer(decoded, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "test.xlsx")
    expect(result).toBeDefined()
    expect(result!.text).toContain("42")
  })

  test("PPTX survives base64 encode/decode", async () => {
    const original = await minimalPptx("Encoded slide")
    const encoded = original.toString("base64")
    const decoded = Buffer.from(encoded, "base64")
    const result = await DocumentExtractor.extractFromBuffer(decoded, "application/vnd.openxmlformats-officedocument.presentationml.presentation", "test.pptx")
    expect(result).toBeDefined()
    expect(result!.text).toContain("Encoded slide")
  })
})
