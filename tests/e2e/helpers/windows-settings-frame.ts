export type SettingsFrame = {
  FramePid: number
  AppPid: number
  FrameHwnd: string
}

export type SettingsCloseStatus = 'Closed' | 'AlreadyGone' | 'IdentityMismatch'

export type SettingsCloseResult = {
  Status: SettingsCloseStatus
}

const CLOSE_STATUSES = ['Closed', 'AlreadyGone', 'IdentityMismatch'] as const

export function parseSettingsLaunchOutput(stdout: string): SettingsFrame {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout.trim())
  } catch (parseError) {
    throw new Error(
      `Failed to parse SettingsFrameLauncher output as JSON.\nStdout: ${stdout}\nError: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    )
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Number.isSafeInteger((parsed as Record<string, unknown>).FramePid) ||
    ((parsed as Record<string, unknown>).FramePid as number) <= 0 ||
    !Number.isSafeInteger((parsed as Record<string, unknown>).AppPid) ||
    ((parsed as Record<string, unknown>).AppPid as number) <= 0 ||
    typeof (parsed as Record<string, unknown>).FrameHwnd !== 'string' ||
    !/^0x[0-9a-f]+$/i.test((parsed as Record<string, unknown>).FrameHwnd as string) ||
    BigInt((parsed as Record<string, unknown>).FrameHwnd as string) === BigInt(0)
  ) {
    throw new Error(`Invalid SettingsFrameLauncher payload shape: ${stdout}`)
  }

  return parsed as SettingsFrame
}

export function parseSettingsCloseOutput(stdout: string): SettingsCloseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout.trim())
  } catch {
    throw new Error(`Failed to parse SettingsFrameLauncher close output as JSON: ${stdout}`)
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).Status !== 'string' ||
    !CLOSE_STATUSES.includes((parsed as Record<string, unknown>).Status as SettingsCloseStatus)
  ) {
    throw new Error(`Invalid SettingsFrameLauncher close payload: ${stdout}`)
  }

  return parsed as SettingsCloseResult
}

export function buildGetSettingsStateArgs(frame: SettingsFrame): string[] {
  return [
    'computer',
    'get-app-state',
    '--app',
    `pid:${frame.FramePid}`,
    '--window-id',
    BigInt(frame.FrameHwnd).toString(10),
    '--no-screenshot',
    '--json'
  ]
}

export function buildCloseSettingsArgs(frame: SettingsFrame): string[] {
  return [
    '-Action',
    'Close',
    '-Hwnd',
    frame.FrameHwnd,
    '-FramePid',
    String(frame.FramePid),
    '-AppPid',
    String(frame.AppPid),
    '-TimeoutMilliseconds',
    '5000'
  ]
}
