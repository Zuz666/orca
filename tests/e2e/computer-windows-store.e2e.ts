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

const isWindows = process.platform === 'win32'
const e2eOptIn = process.env.ORCA_COMPUTER_E2E === '1'

describe.skipIf(!isWindows || !e2eOptIn)('computer-use Windows e2e (Store apps)', () => {
  test('Store app windows are discoverable by title and clickable', async () => {
    await ensureOrcaRuntimeLaunched()
    let targetHwnd: string | undefined
    try {
      const frame = await launchSettingsApp()
      const targetPid = String(frame.FramePid)
      targetHwnd = frame.FrameHwnd

      const apps = parseJsonOutput<{ result: ComputerListAppsResult }>(
        (await runOrcaCli(['computer', 'list-apps', '--json'])).stdout
      )
      expect(apps.result.apps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bundleId: 'ApplicationFrameHost', pid: Number.parseInt(targetPid, 10) })
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
      // Find the first valid element index in the tree. We avoid role names to prevent localization issues.
      const index = findRoleIndex(state.result.snapshot.treeText, /^\s*(\d+)\s+[^\n]+/m)
      expect(index).toBeGreaterThanOrEqual(0)
      state = parseJsonOutput<{ result: ComputerSnapshotResult }>(
        (
          await runOrcaCli([
            'computer',
            'click',
            '--app',
            `pid:${targetPid}`,
            '--element-index',
            String(index),
            '--no-screenshot',
            '--json'
          ])
        ).stdout
      )
      // Ensure the snapshot returned after the click still belongs to our targeted app
      expect(state.result.snapshot.app.pid).toBe(Number.parseInt(targetPid, 10))
      expect(state.result.snapshot.treeText.length).toBeGreaterThan(0)
    } finally {
      if (targetHwnd) {
        await killSettingsApp(targetHwnd)
      }
      await stopOrcaRuntime()
    }
  })
})
const execFileAsync = promisify(execFile)

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
  return JSON.parse(stdout.trim())
}

async function killSettingsApp(hwnd: string): Promise<void> {
  await runSettingsFrameScript(
    ['-Action', 'Close', '-Hwnd', hwnd, '-TimeoutMilliseconds', '5000'],
    10000
  ).catch((error: unknown) => {
    console.warn(`Failed to close Settings frame ${hwnd}:`, error)
  })
}
