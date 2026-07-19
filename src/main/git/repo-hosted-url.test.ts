import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  gitExecFileSync: vi.fn()
}))

vi.mock('./runner', () => ({
  gitExecFileSync: mocks.gitExecFileSync,
  gitExecFileAsync: vi.fn()
}))

import { getRemoteCommitFileUrl } from './repo'

const SHA = '0123456789abcdef0123456789abcdef01234567'

describe('getRemoteCommitFileUrl', () => {
  beforeEach(() => {
    mocks.gitExecFileSync.mockReset()
  })

  it('reads origin with the owning WSL distro and builds a snapshot URL', () => {
    mocks.gitExecFileSync.mockReturnValue('git@github.com:Org/Repo.git\n')

    expect(
      getRemoteCommitFileUrl('/repo', 'src/a file.ts', SHA, { wslDistro: 'Ubuntu-24.04' })
    ).toBe(`https://github.com/Org/Repo/blob/${SHA}/src/a%20file.ts`)
    expect(mocks.gitExecFileSync).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], {
      cwd: '/repo',
      wslDistro: 'Ubuntu-24.04'
    })
  })

  it('returns null when origin cannot be read', () => {
    mocks.gitExecFileSync.mockImplementation(() => {
      throw new Error('missing origin')
    })

    expect(getRemoteCommitFileUrl('/repo', 'src/a.ts', SHA)).toBeNull()
  })
})
