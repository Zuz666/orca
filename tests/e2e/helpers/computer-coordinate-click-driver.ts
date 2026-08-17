import type {
  ComputerActionResult,
  ComputerSnapshotResult
} from '../../../src/shared/runtime-types'
import {
  CliCommandError,
  parseJsonOutput,
  runOrcaCli,
  runOrcaCliAllowFailure
} from './computer-cli-driver'

export async function doubleClickTextEditWord(): Promise<{
  action: ComputerActionResult['action']
  replacedWord: boolean
}> {
  const filler = Array(10).fill('wordword').join('\n')
  await runOrcaCli([
    'computer',
    'hotkey',
    '--app',
    'TextEdit',
    '--key',
    'CmdOrCtrl+A',
    '--no-screenshot'
  ])
  await runOrcaCli([
    'computer',
    'paste-text',
    '--app',
    'TextEdit',
    '--text',
    filler,
    '--no-screenshot'
  ])

  const clicked = parseJsonOutput<{ result: ComputerActionResult }>(
    (
      await runOrcaCli([
        'computer',
        'click',
        '--app',
        'TextEdit',
        '--x',
        '40',
        '--y',
        '70',
        '--click-count',
        '2',
        '--no-screenshot',
        '--json'
      ])
    ).stdout
  )
  const marker = `zz${Date.now()}zz`
  await runOrcaCli([
    'computer',
    'type-text',
    '--app',
    'TextEdit',
    '--text',
    marker,
    '--no-screenshot'
  ])

  const after = parseJsonOutput<{ result: ComputerSnapshotResult }>(
    (
      await runOrcaCli([
        'computer',
        'get-app-state',
        '--app',
        'TextEdit',
        '--no-screenshot',
        '--json'
      ])
    ).stdout
  )
  return {
    action: clicked.result.action,
    replacedWord: new RegExp(`${marker}\\s+wordword`).test(after.result.snapshot.treeText)
  }
}

export async function clickCapturedTextEditOpenDialog(): Promise<{
  clickPath: string | undefined
  dialogClosed: boolean
  dialogWasNew: boolean
}> {
  const before = parseJsonOutput<{
    result: { windows: { id?: number | null }[] }
  }>((await runOrcaCli(['computer', 'list-windows', '--app', 'TextEdit', '--json'])).stdout)
  const existingWindowIds = new Set(before.result.windows.map((window) => window.id))

  const opened = parseJsonOutput<{ result: ComputerActionResult }>(
    (
      await runOrcaCli([
        'computer',
        'hotkey',
        '--app',
        'TextEdit',
        '--key',
        'CmdOrCtrl+O',
        '--restore-window',
        '--no-screenshot',
        '--json'
      ])
    ).stdout
  )
  const dialog = opened.result.snapshot.window
  const clickOutcome = await runOrcaCliAllowFailure([
    'computer',
    'click',
    '--app',
    'TextEdit',
    '--window-id',
    String(dialog.id),
    '--x',
    String(dialog.width - 140),
    '--y',
    String(dialog.height - 30),
    '--no-screenshot',
    '--json'
  ])
  let clickPath: string | undefined
  if (clickOutcome.ok) {
    clickPath = parseJsonOutput<{ result: ComputerActionResult }>(clickOutcome.result.stdout).result
      .action?.path
  } else if (finalPressFenceAbort(clickOutcome.failure.stdout)) {
    // Why: a Cancel click that closes the dialog legitimately removes the
    // focused recipient; the fence aborts only after the press was delivered,
    // so the dialogClosed postcondition below decides the verdict.
    clickPath = 'synthetic'
  } else {
    throw new CliCommandError(clickOutcome.failure)
  }
  const after = parseJsonOutput<{
    result: { windows: { id?: number | null }[] }
  }>((await runOrcaCli(['computer', 'list-windows', '--app', 'TextEdit', '--json'])).stdout)

  return {
    clickPath,
    dialogClosed: !after.result.windows.some((window) => window.id === dialog.id),
    dialogWasNew: !existingWindowIds.has(dialog.id)
  }
}

type FenceAbortEnvelope = {
  ok: false
  error: { code: string; data?: { deliveredPresses?: unknown; phase?: unknown } }
}

// Why: only a delivered final press may resolve via the postcondition; every
// other failure shape stays a hard error for the caller to rethrow.
function finalPressFenceAbort(stdout: string): boolean {
  let envelope: FenceAbortEnvelope | undefined
  try {
    envelope = parseJsonOutput<FenceAbortEnvelope>(stdout)
  } catch {
    return false
  }
  if (!envelope || envelope.ok !== false || envelope.error.code !== 'window_not_focused') {
    return false
  }
  const data = envelope.error.data
  return (
    data?.phase === 'after-press' &&
    typeof data?.deliveredPresses === 'number' &&
    data.deliveredPresses >= 1
  )
}
