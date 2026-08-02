import { dispatchProjectionFocus } from "@/lib/projection-focus"
import { patchSearchParams, searchParamOne, type RailSearchParams } from "@/lib/focus/rail-params"

export function whiteboardProjectionParams(path: string, current: RailSearchParams = {}): RailSearchParams {
  const next = patchSearchParams(current, {
    whiteboard: path,
    section: null,
    asset: null,
    cmsCollection: null,
    cmsEntry: null,
  })
  return {
    ...(next ?? current),
    view: "projection",
    lens: "whiteboards",
  }
}

export function readWhiteboardPath(params: RailSearchParams | undefined) {
  return searchParamOne(params?.whiteboard)
}

export function openWhiteboardProjection(
  path: string,
  setSearchParams: (params: RailSearchParams, options?: { replace?: boolean }) => void,
  current: RailSearchParams = {},
) {
  setSearchParams(whiteboardProjectionParams(path, current), { replace: true })
  dispatchProjectionFocus({ lens: "whiteboards", path })
}
