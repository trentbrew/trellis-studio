import { describe, expect, test } from "bun:test"
import * as XLSX from "xlsx"
import { dataToWorkbook, workbookToData, type SheetRow } from "./xlsx-data"

describe("xlsx workbook data conversion", () => {
  test("converts workbook sheets, formulas, merges, and styles to spreadsheet data", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Name", "Score"],
      ["Ada", 42],
    ])
    ws.C2 = { t: "n", f: "B2*2" }
    ws.A1.s = {
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      fill: { fgColor: { rgb: "FFFF0000" } },
      font: { bold: true, color: { rgb: "FF00FF00" } },
    }
    ws["!merges"] = [XLSX.utils.decode_range("A1:B1")]
    ws["!cols"] = [{ wpx: 128 }]
    ws["!rows"] = [{ hpx: 26 }]

    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, ws, "Summary")

    const data = workbookToData(book)
    expect(data[0]?.name).toBe("Summary")
    expect((data[0]?.rows?.[0] as SheetRow).cells?.[0]?.text).toBe("Name")
    expect((data[0]?.rows?.[1] as SheetRow).cells?.[2]?.text).toBe("=B2*2")
    expect(data[0]?.merges).toContain("A1:B1")
    expect(data[0]?.styles?.[0]).toMatchObject({ align: "center", bgcolor: "#FF0000", textwrap: true })
  })

  test("writes spreadsheet data back to a workbook", () => {
    const book = dataToWorkbook([
      {
        name: "Edited",
        merges: ["A1:B1"],
        rows: {
          0: { cells: { 0: { text: "Total", merge: [0, 1] } } },
          1: { cells: { 0: { text: "21" }, 1: { text: "=A2*2" } } },
        },
      },
    ])
    const ws = book.Sheets.Edited

    expect(book.SheetNames).toEqual(["Edited"])
    expect(ws?.A1?.v).toBe("Total")
    expect(ws?.A2?.v).toBe(21)
    expect(ws?.B2?.f).toBe("A2*2")
    expect(ws?.["!ref"]).toBe("A1:B2")
    expect(ws?.["!merges"]?.map((item) => XLSX.utils.encode_range(item))).toContain("A1:B1")
  })
})
