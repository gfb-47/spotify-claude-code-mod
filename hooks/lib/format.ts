export function clip(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, Math.max(1, width - 1))}…` : text
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
