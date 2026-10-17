import type { HttpInit, HttpResponse, ProcessRunInit, ProcessRunResult } from 'claude-code'

// What the services need from the engine. The engine only lets `$` travel within register.tsx,
// so register.tsx builds one of these from `$` and the services stay plain, testable code.
export type Host = {
  run: (argv: string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  fetch: (url: string, init?: HttpInit) => Promise<HttpResponse>
  readBase64: (path: string) => Promise<string>
}
