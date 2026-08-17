export class RuntimeClientError extends Error {
  readonly code: string
  // Why optional: older native helpers and sidecar peers never send it; unknown
  // to every reader that predates structured computer-use error payloads.
  readonly data?: unknown

  constructor(code: string, message: string, data?: unknown) {
    super(message)
    this.name = 'RuntimeClientError'
    this.code = code
    this.data = data
  }
}
