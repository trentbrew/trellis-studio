/** Re-export materialized path helpers for Studio app code. */
export {
  allWhiteboardSearchDirs,
  dedupeWhiteboardPath,
  defaultWhiteboardPath,
  isKnownWhiteboardLocation,
  isSketchWhiteboardPath,
  legacyWhiteboardDirs,
  LEGACY_WHITEBOARD_DIR,
  MATERIALIZED_PATHS,
  slugFromWhiteboardPath,
  slugifyWhiteboardTitle,
  whiteboardEntityId,
  whiteboardPathForIntent,
  type MaterializedKind,
  type MaterializedPathRule,
  type WhiteboardPathIntent,
} from "@opencode-ai/whiteboard/browser"
