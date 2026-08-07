import { describe, expect, it } from 'vitest'
import {
  buildCloseSettingsArgs,
  buildGetSettingsStateArgs,
  parseSettingsCloseOutput,
  parseSettingsLaunchOutput
} from './windows-settings-frame'

describe('windows-settings-frame helpers', () => {
  describe('buildGetSettingsStateArgs', () => {
    it('targets the exact ApplicationFrameHost frame returned by the launcher', () => {
      const frame = { FramePid: 123, AppPid: 456, FrameHwnd: '0x1234' }

      expect(buildGetSettingsStateArgs(frame)).toEqual([
        'computer',
        'get-app-state',
        '--app',
        'pid:123',
        '--window-id',
        '4660',
        '--no-screenshot',
        '--json'
      ])
    })

    it('converts large 64-bit HWND to decimal without precision loss', () => {
      const frame = { FramePid: 1, AppPid: 2, FrameHwnd: '0x1FFFFFFFF' }
      const args = buildGetSettingsStateArgs(frame)
      const windowIdIndex = args.indexOf('--window-id')
      expect(args[windowIdIndex + 1]).toBe('8589934591')
    })
  })

  describe('buildCloseSettingsArgs', () => {
    it('passes FramePid and AppPid without mixing them up', () => {
      const frame = { FramePid: 123, AppPid: 456, FrameHwnd: '0x1234' }

      expect(buildCloseSettingsArgs(frame)).toEqual([
        '-Action',
        'Close',
        '-Hwnd',
        '0x1234',
        '-FramePid',
        '123',
        '-AppPid',
        '456',
        '-TimeoutMilliseconds',
        '5000'
      ])
    })
  })

  describe('parseSettingsLaunchOutput', () => {
    it('parses valid JSON with all required fields', () => {
      const stdout = '{"AppPid":456,"FramePid":123,"FrameHwnd":"0x1234"}'
      const result = parseSettingsLaunchOutput(stdout)

      expect(result).toEqual({ AppPid: 456, FramePid: 123, FrameHwnd: '0x1234' })
    })

    it('throws on malformed JSON with descriptive error', () => {
      expect(() => parseSettingsLaunchOutput('not json')).toThrow(
        /Failed to parse SettingsFrameLauncher output as JSON/
      )
    })

    it('throws on valid JSON with invalid payload shape', () => {
      expect(() => parseSettingsLaunchOutput('{"foo":"bar"}')).toThrow(
        /Invalid SettingsFrameLauncher payload shape/
      )
    })

    it('throws on zero or negative PID', () => {
      expect(() =>
        parseSettingsLaunchOutput('{"AppPid":0,"FramePid":123,"FrameHwnd":"0x1"}')
      ).toThrow(/Invalid SettingsFrameLauncher payload shape/)
      expect(() =>
        parseSettingsLaunchOutput('{"AppPid":-1,"FramePid":123,"FrameHwnd":"0x1"}')
      ).toThrow(/Invalid SettingsFrameLauncher payload shape/)
    })

    it('throws on non-hex HWND', () => {
      expect(() =>
        parseSettingsLaunchOutput('{"AppPid":1,"FramePid":2,"FrameHwnd":"1234"}')
      ).toThrow(/Invalid SettingsFrameLauncher payload shape/)
    })

    it('throws on fractional PID', () => {
      expect(() =>
        parseSettingsLaunchOutput('{"AppPid":1.5,"FramePid":2,"FrameHwnd":"0x1"}')
      ).toThrow(/Invalid SettingsFrameLauncher payload shape/)
    })
  })

  describe('parseSettingsCloseOutput', () => {
    it('parses Closed status', () => {
      expect(parseSettingsCloseOutput('{"Status":"Closed"}')).toEqual({ Status: 'Closed' })
    })

    it('parses AlreadyGone status', () => {
      expect(parseSettingsCloseOutput('{"Status":"AlreadyGone"}')).toEqual({
        Status: 'AlreadyGone'
      })
    })

    it('parses IdentityMismatch status', () => {
      expect(parseSettingsCloseOutput('{"Status":"IdentityMismatch"}')).toEqual({
        Status: 'IdentityMismatch'
      })
    })

    it('throws on missing Status field', () => {
      expect(() => parseSettingsCloseOutput('{"foo":"bar"}')).toThrow(
        /Invalid SettingsFrameLauncher close payload/
      )
    })
  })
})
