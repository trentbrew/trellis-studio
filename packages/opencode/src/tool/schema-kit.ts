import z from "zod"

/**
 * Shared zod primitives for tool & entity schemas.
 *
 * Models (and MCP clients) routinely send slightly-off JSON: the string "true"
 * for a boolean, "5" for a number, "Meeting" for a lowercase enum, or `null`
 * where they meant to omit an optional field. Plain zod rejects all of these,
 * producing "invalid arguments" errors for calls whose intent was unambiguous.
 *
 * These helpers coerce when the intent is clear, and otherwise fall through to
 * zod so the error message still lists what was expected. Use them everywhere a
 * tool param or entity attribute is defined so coercion is consistent and
 * defined once.
 */
export namespace SchemaKit {
  function toBool(val: unknown): unknown {
    if (typeof val === "boolean") return val
    if (typeof val === "number") return val !== 0
    if (typeof val === "string") {
      const s = val.trim().toLowerCase()
      if (s === "true" || s === "1" || s === "yes" || s === "on") return true
      if (s === "false" || s === "0" || s === "no" || s === "off") return false
    }
    return val
  }

  /** Boolean that tolerates "true"/"1"/"yes"/"on" (and the negatives). */
  export const boolish = z.preprocess(toBool, z.boolean())

  /** Optional boolean; `null`/`undefined`/"" mean omitted. */
  export const boolishOptional = z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined
    return toBool(val)
  }, z.boolean().optional())

  /** Integer that tolerates a numeric string ("5" -> 5). */
  export const intish = z.preprocess((val) => {
    if (typeof val === "string" && val.trim() !== "" && Number.isFinite(Number(val))) return Number(val)
    return val
  }, z.number().int())

  /** Number that tolerates a numeric string. */
  export const numberish = z.preprocess((val) => {
    if (typeof val === "string" && val.trim() !== "" && Number.isFinite(Number(val))) return Number(val)
    return val
  }, z.number())

  /**
   * Case-insensitive enum. Maps "Meeting"/" MEETING " to the canonical lowercase
   * member. Unknown values fall through to zod, which reports the allowed set.
   */
  export function looseEnum<T extends readonly [string, ...string[]]>(values: T) {
    const canon = new Map(values.map((v) => [v.toLowerCase(), v]))
    return z.preprocess((val) => {
      if (typeof val !== "string") return val
      return canon.get(val.trim().toLowerCase()) ?? val
    }, z.enum(values))
  }

  /**
   * Optional field where `null` is treated as "omitted" rather than rejected —
   * the single most common LLM mistake. For fields where `null` is a meaningful
   * "clear this value" signal, use `schema.nullable().optional()` directly.
   */
  export function optionalNullSafe<T extends z.ZodType>(schema: T) {
    return z.preprocess((val) => (val === null ? undefined : val), schema.optional())
  }

  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

  /** Non-empty string that is either YYYY-MM-DD or a parseable datetime. */
  export const dateish = z
    .string()
    .trim()
    .min(1)
    .refine((v) => DATE_ONLY.test(v) || !Number.isNaN(new Date(v).getTime()), {
      message: "Expected YYYY-MM-DD or an ISO datetime (e.g. 2026-05-27T15:00:00.000Z)",
    })

  /**
   * A JSON-string field whose parsed shape must satisfy `schema`. Tolerates an
   * already-parsed object too. Empty string / "null" parse to `undefined`.
   */
  export function jsonRule<T extends z.ZodType>(schema: T) {
    return z.preprocess((val) => {
      if (val === undefined || val === null) return undefined
      if (typeof val === "object") return val
      if (typeof val === "string") {
        const s = val.trim()
        if (s === "" || s === "null") return undefined
        try {
          return JSON.parse(s)
        } catch {
          return val
        }
      }
      return val
    }, schema.optional())
  }
}
