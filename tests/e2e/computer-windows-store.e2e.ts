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
const execFileAsync = promisify(execFile)

const isWindows = process.platform === 'win32'
const e2eOptIn = process.env.ORCA_COMPUTER_E2E === '1'

// Settings is single-instance UWP. This file assumes an isolated CI session:
// do not run in parallel with other UWP e2e, and expect teardown to close
// any pre-existing Settings window in the same session.
describe.skipIf(!isWindows || !e2eOptIn)('computer-use Windows e2e (Store apps)', () => {
  test('Store app windows are discoverable and attachable by pid', async () => {
    await ensureOrcaRuntimeLaunched()
    let targetHwnd: string | undefined
    let targetPid: number | undefined
    let targetAppPid: number | undefined
    try {
      const frame = await launchSettingsApp()
      targetPid = frame.FramePid
      targetAppPid = frame.AppPid
      targetHwnd = frame.FrameHwnd

      const apps = parseJsonOutput<{ result: ComputerListAppsResult }>(
        (await runOrcaCli(['computer', 'list-apps', '--json'])).stdout
      )
      expect(apps.result.apps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bundleId: 'ApplicationFrameHost', pid: targetPid })
        ])
      )
      let state = parseJsonOutput<{ result: ComputerSnapshotResult }>(
        (
          await runOrcaCli([
            'computer',
            'get-app-state',
            '--app',
            `pid:${targetPid}`,
            '--window-id',
            BigInt(targetHwnd).toString(10),
            '--no-screenshot',
            '--json'
          ])
        ).stdout
      )
      // Ensure the snapshot returned belongs to our targeted app
      expect(state.result.snapshot.app.pid).toBe(targetPid)
      expect(state.result.snapshot.treeText.length).toBeGreaterThan(0)
    } finally {
      if (targetHwnd && targetPid !== undefined && targetAppPid !== undefined) {
        await killSettingsApp(targetHwnd, targetPid, targetAppPid)
      } else {
        // Fallback cleanup skipped: terminating by name breaks CI isolation and user environments.
        console.warn('Launch timed out or failed, skipping teardown to avoid killing unrelated UWP apps.')
      }
      await stopOrcaRuntime()
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

async function launchSettingsApp(): Promise<{ FramePid: number; FrameHwnd: string; AppPid: number }> {
  const stdout = await runSettingsFrameScript(
    ['-Action', 'Launch', '-TimeoutMilliseconds', '15000'],
    20000
  )
  try {
    const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>
    if (typeof parsed.FramePid !== 'number' || typeof parsed.FrameHwnd !== 'string' || typeof parsed.AppPid !== 'number') {
      throw new Error(`Invalid SettingsFrameLauncher payload: ${stdout}`)
    }
    return parsed as { FramePid: number; FrameHwnd: string; AppPid: number }
  } catch (error) {
    throw new Error(`Failed to parse SettingsFrameLauncher output as JSON.\nStdout: ${stdout}\nError: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function killSettingsApp(hwnd: string, framePid: number, appPid: number): Promise<void> {
  try {
    const stdout = await runSettingsFrameScript(
      ['-Action', 'Close', '-Hwnd', hwnd, '-FramePid', String(framePid), '-AppPid', String(appPid), '-TimeoutMilliseconds', '5000'],
      10000
    )
    const result = JSON.parse(stdout.trim()) as Record<string, unknown>
    if (result.Closed !== true) {
      console.warn(`Settings frame ${hwnd} identity mismatch or close failed. Cleanup aborted to preserve isolation.`)
    }
  } catch (error) {
    console.warn(`Failed to close Settings frame ${hwnd}:`, error)
  }
}
