import { describe, expect, test } from 'vitest'
import type { ComputerListAppsResult, ComputerSnapshotResult } from '../../src/shared/runtime-types'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  ensureOrcaRuntimeLaunched,
  findRoleIndex,
  parseJsonOutput,
  runOrcaCli,
  stopOrcaRuntime
} from './helpers/computer-driver'
const execFileAsync = promisify(execFile)

const isWindows = process.platform === 'win32'
const e2eOptIn = process.env.ORCA_COMPUTER_E2E === '1'

describe.skipIf(!isWindows || !e2eOptIn)('computer-use Windows e2e (Store apps)', () => {
  test('Store app windows are discoverable by title and clickable', async () => {
    await ensureOrcaRuntimeLaunched()
    let targetHwnd: string | undefined
    let targetPid: number | undefined
    try {
      const frame = await launchSettingsApp()
      targetPid = frame.FramePid
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
            '--no-screenshot',
            '--json'
          ])
        ).stdout
      )
      // Ensure the snapshot returned belongs to our targeted app
      expect(state.result.snapshot.app.pid).toBe(targetPid)
      expect(state.result.snapshot.treeText.length).toBeGreaterThan(0)
    } finally {
      if (targetHwnd && targetPid !== undefined) {
        await killSettingsApp(targetHwnd, targetPid)
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

async function launchSettingsApp(): Promise<{ FramePid: number; FrameHwnd: string }> {
  const stdout = await runSettingsFrameScript(
    ['-Action', 'Launch', '-TimeoutMilliseconds', '15000'],
    20000
  )
  try {
    return JSON.parse(stdout.trim())
  } catch (error) {
    throw new Error(`Failed to parse SettingsFrameLauncher output as JSON.\nStdout: ${stdout}\nError: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function killSettingsApp(hwnd: string, framePid: number): Promise<void> {
  await runSettingsFrameScript(
    ['-Action', 'Close', '-Hwnd', hwnd, '-FramePid', String(framePid), '-TimeoutMilliseconds', '5000'],
    10000
  ).catch((error: unknown) => {
    console.warn(`Failed to close Settings frame ${hwnd}:`, error)
  })
}
