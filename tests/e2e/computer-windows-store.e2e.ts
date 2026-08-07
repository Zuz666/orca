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
    let targetPid: string | undefined
    let targetHwnd: string | undefined
    const frame = await launchSettingsApp()
    targetPid = String(frame.FramePid)
    targetHwnd = frame.FrameHwnd
    try {
      const apps = parseJsonOutput<{ result: ComputerListAppsResult }>(
        (await runOrcaCli(['computer', 'list-apps', '--json'])).stdout
      )
      expect(apps.result.apps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bundleId: 'ApplicationFrameHost', pid: Number.parseInt(targetPid!, 10) })
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

async function launchSettingsApp(): Promise<{ FramePid: number; FrameHwnd: string }> {
  const scriptPath = join(__dirname, 'helpers', 'Invoke-SettingsApplicationFrame.ps1')
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Action',
      'Launch',
      '-TimeoutMilliseconds',
      '15000'
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 20000
    }
  )
  return JSON.parse(stdout.trim())
}

async function killSettingsApp(hwnd: string): Promise<void> {
  const scriptPath = join(__dirname, 'helpers', 'Invoke-SettingsApplicationFrame.ps1')
  await execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Action',
      'Close',
      '-Hwnd',
      hwnd,
      '-TimeoutMilliseconds',
      '5000'
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 10000
    }
  ).catch(() => undefined)
}
