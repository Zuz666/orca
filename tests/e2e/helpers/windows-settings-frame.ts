export interface SettingsFrame {
  FramePid: number
  AppPid: number
  FrameHwnd: string
}

export interface SettingsCloseResult {
  Status: string
}

export function parseSettingsLaunchOutput(stdout: string): SettingsFrame {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stdout.trim()) as Record<string, unknown>
  } catch (parseError) {
    throw new Error(
      `Failed to parse SettingsFrameLauncher output as JSON.\nStdout: ${stdout}\nError: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    )
  }

  if (
    !Number.isSafeInteger(parsed.FramePid) ||
    (parsed.FramePid as number) <= 0 ||
    !Number.isSafeInteger(parsed.AppPid) ||
    (parsed.AppPid as number) <= 0 ||
    typeof parsed.FrameHwnd !== 'string' ||
    !/^0x[0-9a-f]+$/i.test(parsed.FrameHwnd)
  ) {
    throw new Error(`Invalid SettingsFrameLauncher payload shape: ${stdout}`)
  }

  return parsed as unknown as SettingsFrame
}

export function parseSettingsCloseOutput(stdout: string): SettingsCloseResult {
  const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>
  if (typeof parsed.Status !== 'string') {
    throw new Error(`Invalid SettingsFrameLauncher close payload: ${stdout}`)
  }
  return parsed as unknown as SettingsCloseResult
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
