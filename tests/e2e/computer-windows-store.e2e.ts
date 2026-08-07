import { describe, expect, test } from 'vitest'
import type { ComputerListAppsResult, ComputerSnapshotResult } from '../../src/shared/runtime-types'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  ensureOrcaRuntimeLaunched,
  parseJsonOutput,
  runOrcaCli,
  stopOrcaRuntime
} from './helpers/computer-driver'
import {
  buildCloseSettingsArgs,
  buildGetSettingsStateArgs,
  parseSettingsCloseOutput,
  parseSettingsLaunchOutput,
  type SettingsFrame
} from './helpers/windows-settings-frame'

const execFileAsync = promisify(execFile)

const isWindows = process.platform === 'win32'
const e2eOptIn = process.env.ORCA_COMPUTER_E2E === '1'

// Settings is single-instance UWP. This file assumes an isolated CI session:
// do not run in parallel with other UWP e2e, and expect teardown to close
// any pre-existing Settings window in the same session.
describe.skipIf(!isWindows || !e2eOptIn)('computer-use Windows e2e (Store apps)', () => {
  test('Store app windows are discoverable and attachable by pid', { timeout: 120_000 }, async () => {
    let frame: SettingsFrame | undefined
    let primaryError: unknown
    let hasPrimaryError = false

    try {
      await ensureOrcaRuntimeLaunched()

      frame = await launchSettingsApp()

      const apps = parseJsonOutput<{ result: ComputerListAppsResult }>(
        (await runOrcaCli(['computer', 'list-apps', '--json'])).stdout
      )
      expect(apps.result.apps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bundleId: 'ApplicationFrameHost', pid: frame.FramePid })
        ])
      )
      const state = parseJsonOutput<{ result: ComputerSnapshotResult }>(
        (await runOrcaCli(buildGetSettingsStateArgs(frame))).stdout
      )
      // Ensure the snapshot returned belongs to our targeted app
      expect(state.result.snapshot.app.pid).toBe(frame.FramePid)
      expect(state.result.snapshot.treeText.length).toBeGreaterThan(0)
    } catch (error) {
      hasPrimaryError = true
      primaryError = error
    }

    const cleanupErrors: unknown[] = []

    if (frame) {
      try {
        await closeSettingsFrame(frame)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    try {
      await stopOrcaRuntime()
    } catch (error) {
      cleanupErrors.push(error)
    }

    if (hasPrimaryError) {
      if (cleanupErrors.length > 0) {
        throw new AggregateError([primaryError, ...cleanupErrors], 'The E2E test and its cleanup both failed')
      }
      throw primaryError
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'E2E cleanup failed')
    }
  })
})

const settingsFrameScript = join(__dirname, 'helpers', 'Invoke-SettingsApplicationFrame.ps1')

async function runSettingsFrameScript(scriptArgs: string[], timeoutMs: number): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Sta',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      settingsFrameScript,
      ...scriptArgs
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: timeoutMs
    }
  )
  return stdout
}

async function launchSettingsApp(): Promise<SettingsFrame> {
  const stdout = await runSettingsFrameScript(
    ['-Action', 'Launch', '-TimeoutMilliseconds', '15000'],
    45000
  )
  return parseSettingsLaunchOutput(stdout)
}

async function closeSettingsFrame(frame: SettingsFrame): Promise<void> {
  const stdout = await runSettingsFrameScript(buildCloseSettingsArgs(frame), 30000)
  const result = parseSettingsCloseOutput(stdout)
  if (result.Status !== 'Closed' && result.Status !== 'AlreadyGone') {
    throw new Error(
      `Settings frame ${frame.FrameHwnd} teardown returned status "${result.Status}" (identity mismatch or failure).`
    )
  }
}
