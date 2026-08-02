export type ImageProvider = "auto" | "gemini" | "openai"

export const MEDIA_GENERATE_DEFAULTS = {
  size: "1024x1024",
  output_format: "png" as const,
}

export type MediaGenerateInput = {
  prompt: string
  provider: ImageProvider
}

export function mediaGenerateUrl(baseUrl: string, directory: string) {
  const base = baseUrl.replace(/\/+$/, "")
  return `${base}/file/media/generate?directory=${encodeURIComponent(directory)}`
}

export function mediaGenerateBody(input: MediaGenerateInput) {
  return {
    prompt: input.prompt,
    provider: input.provider,
    ...MEDIA_GENERATE_DEFAULTS,
  }
}

export function mediaGenerateRequest(baseUrl: string, directory: string, input: MediaGenerateInput) {
  return {
    url: mediaGenerateUrl(baseUrl, directory),
    body: mediaGenerateBody(input),
  }
}
