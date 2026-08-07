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

    it('converts HWND above Number.MAX_SAFE_INTEGER without precision loss', () => {
      // Why: 0x20000000000001 = 9007199254740993 > 2^53. Using Number() would round to 9007199254740992.
      const frame = { FramePid: 1, AppPid: 2, FrameHwnd: '0x20000000000001' }
      const args = buildGetSettingsStateArgs(frame)
      const windowIdIndex = args.indexOf('--window-id')
      expect(args[windowIdIndex + 1]).toBe('9007199254740993')
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

    it('throws on null JSON', () => {
      expect(() => parseSettingsLaunchOutput('null')).toThrow(
        /Invalid SettingsFrameLauncher payload shape/
      )
    })

    it('throws on valid JSON with invalid payload shape', () => {
      expect(() => parseSettingsLaunchOutput('{"foo":"bar"}')).toThrow(
        /Invalid SettingsFrameLauncher payload shape/
      )
    })

    it.each([
      ['AppPid', 0],
      ['AppPid', -1],
      ['AppPid', 1.5],
      ['FramePid', 0],
      ['FramePid', -1],
      ['FramePid', 1.5]
    ] as const)('rejects invalid %s=%s', (field, value) => {
      const payload = {
        AppPid: 1,
        FramePid: 2,
        FrameHwnd: '0x1',
        [field]: value
      }

      expect(() => parseSettingsLaunchOutput(JSON.stringify(payload))).toThrow(
        /Invalid SettingsFrameLauncher payload shape/
      )
    })

    it('throws on non-hex HWND', () => {
      expect(() =>
        parseSettingsLaunchOutput('{"AppPid":1,"FramePid":2,"FrameHwnd":"1234"}')
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

    it('throws on unknown Status value', () => {
      expect(() => parseSettingsCloseOutput('{"Status":"Unknown"}')).toThrow(
        /Invalid SettingsFrameLauncher close payload/
      )
    })

    it('throws on null JSON', () => {
      expect(() => parseSettingsCloseOutput('null')).toThrow(
        /Invalid SettingsFrameLauncher close payload/
      )
    })

    it('throws on malformed JSON', () => {
      expect(() => parseSettingsCloseOutput('not json')).toThrow(
        /Failed to parse SettingsFrameLauncher close output as JSON/
      )
    })
  })
})
