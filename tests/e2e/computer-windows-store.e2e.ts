import { describe, expect, test } from 'vitest'
import type { ComputerListAppsResult, ComputerSnapshotResult } from '../../src/shared/runtime-types'
import { execFile } from 'node:child_process'
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
    targetPid = await launchSettingsApp()
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
      await killSettingsApp(targetPid)
      await stopOrcaRuntime()
    }
  })
})
async function launchSettingsApp(): Promise<string> {

  // Launch ms-settings and capture the newly spawned ApplicationFrameHost PID
  const script = [
    '$existingHosts = @(Get-Process -Name ApplicationFrameHost -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)',
    'Start-Process ms-settings:',
    '$deadline = (Get-Date).AddSeconds(15)',
    '$targetId = $null',
    'while ((Get-Date) -lt $deadline -and $null -eq $targetId) {',
    '  Start-Sleep -Milliseconds 250',
    '  $newHost = Get-Process -Name ApplicationFrameHost -ErrorAction SilentlyContinue |',
    '    Where-Object { $_.MainWindowHandle -ne 0 -and $existingHosts -notcontains $_.Id } |',
    '    Select-Object -First 1',
    '  if ($null -ne $newHost) { $targetId = $newHost.Id }',
    '}',
    'if ($null -eq $targetId) { throw "No visible Settings window found" }',
    'Write-Output $targetId'
  ].join('\n')

  return new Promise<string>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 20000 },
      (error, stdout) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout.trim())
        }
      }
    )
  })
}

async function killSettingsApp(targetPid?: string): Promise<void> {
  // Why: teardown is best-effort so cleanup noise cannot mask assertion signal.
  await runPowerShell(
    [
      '$processes = @()',
      ...(targetPid ? [`$processes += Get-Process -Id ${targetPid} -ErrorAction SilentlyContinue`] : []),
      'foreach ($process in $processes) {',
      '  try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch { }',
      '}',
      'exit 0'
    ].join('\n')
  ).catch(() => undefined)
}

async function runPowerShell(script: string): Promise<void> {
  const { execFile } = await import('node:child_process')
  await new Promise<void>((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20000 }, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
