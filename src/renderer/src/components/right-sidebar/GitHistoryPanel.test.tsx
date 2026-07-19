// @vitest-environment happy-dom

import { act, type ReactNode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitHistoryItem, GitHistoryResult } from '../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../shared/types'
import { GitHistoryPanel, type GitHistoryPanelState } from './GitHistoryPanel'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  )
}))

const timestamp = new Date(2026, 5, 15, 12).getTime()

function makeHistoryItem(overrides: Partial<GitHistoryItem> = {}): GitHistoryItem {
  return {
    id: '52ad492abcd',
    parentIds: [],
    subject: 'Fix tab overflow',
    message: 'Fix tab overflow',
    displayId: '52ad492',
    author: 'Taylor',
    timestamp,
    references: [],
    ...overrides
  }
}

function makeHistoryResult(items: GitHistoryItem[] = [makeHistoryItem()]): GitHistoryResult {
  return {
    items,
    currentRef: {
      id: 'refs/heads/main',
      name: 'main',
      revision: items[0]?.id ?? '52ad492abcd',
      category: 'branches'
    },
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore: false,
    limit: 50
  }
}

const DEFAULT_PANEL_STATE: GitHistoryPanelState = {
  status: 'ready',
  result: makeHistoryResult()
}

function makeEntry(overrides: Partial<GitBranchChangeEntry>): GitBranchChangeEntry {
  return {
    path: 'src/file.ts',
    status: 'modified',
    added: 1,
    removed: 0,
    ...overrides
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

type RenderPanelOptions = {
  state?: GitHistoryPanelState
  initialCommitFilesViewMode?: 'list' | 'tree'
  onRefresh?: () => void | Promise<void>
  onLoadCommitFiles?: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
  onOpenCommitFile?: (
    item: GitHistoryItem,
    entry: GitBranchChangeEntry,
    event?: {
      altKey: boolean
      ctrlKey: boolean
      metaKey: boolean
      shiftKey: boolean
      openAsPermanent?: boolean
    }
  ) => void
}

function PanelHarness({
  state = DEFAULT_PANEL_STATE,
  initialCommitFilesViewMode = 'list',
  onRefresh = vi.fn(),
  onLoadCommitFiles,
  onOpenCommitFile
}: RenderPanelOptions): ReactNode {
  const [commitFilesViewMode, setCommitFilesViewMode] = useState(initialCommitFilesViewMode)

  return (
    <GitHistoryPanel
      state={state}
      collapsed={false}
      commitFilesViewMode={commitFilesViewMode}
      onCommitFilesViewModeChange={setCommitFilesViewMode}
      onToggle={vi.fn()}
      onRefresh={onRefresh}
      onOpenCommit={vi.fn()}
      onLoadCommitFiles={onLoadCommitFiles}
      onOpenCommitFile={onOpenCommitFile}
    />
  )
}

function renderPanel(options: RenderPanelOptions = {}): void {
  act(() => {
    root.render(<PanelHarness {...options} />)
  })
}

function commitRow(item: GitHistoryItem): HTMLButtonElement {
  const row = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-testid="git-history-row"]')
  ).find((element) =>
    element.getAttribute('aria-label')?.includes(`commit ${item.displayId ?? item.id}:`)
  )
  if (!row) {
    throw new Error(`Missing history row for ${item.id}`)
  }
  return row
}

function commitFiles(item: GitHistoryItem): HTMLElement {
  const files = container.querySelector<HTMLElement>(
    `[data-testid="git-history-commit-files"][data-commit-id="${item.id}"]`
  )
  if (!files) {
    throw new Error(`Missing files for ${item.id}`)
  }
  return files
}

function fileRows(element: ParentNode): HTMLButtonElement[] {
  return Array.from(
    element.querySelectorAll<HTMLButtonElement>('[data-testid="git-history-commit-file"]')
  )
}

function directoryRows(element: ParentNode): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>('[data-testid="git-history-commit-directory"]')
  )
}

function findCommitFilesViewAction(
  label: 'View as list' | 'View as tree'
): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label
    ) ?? null
  )
}

function commitFilesViewAction(label: 'View as list' | 'View as tree'): HTMLButtonElement {
  const action = findCommitFilesViewAction(label)
  if (!action) {
    throw new Error(`Missing commit-files view action: ${label}`)
  }
  return action
}

function commitFilesViewActionCount(): number {
  return ['View as list', 'View as tree'].filter(
    (label) => findCommitFilesViewAction(label as 'View as list' | 'View as tree') !== null
  ).length
}

function selectCommitFilesView(label: 'View as list' | 'View as tree'): void {
  const action = commitFilesViewAction(label)
  act(() => {
    action.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

// Flush exactly the loader microtask chain (click -> loading -> ready). Not
// waitFor: the stale-load test needs 'Loading files' to stay while its loader
// promise is still pending.
async function expandCommit(item: GitHistoryItem): Promise<void> {
  const row = commitRow(item)
  await act(async () => {
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('GitHistoryPanel', () => {
  it.each([Number.NaN, Number.MAX_VALUE])(
    'renders commits with malformed timestamp %s without crashing',
    (malformedTimestamp) => {
      const item = makeHistoryItem({ timestamp: malformedTimestamp })

      renderPanel({ state: { status: 'ready', result: makeHistoryResult([item]) } })

      expect(container.textContent).toContain('Fix tab overflow')
    }
  )

  it('renders the commit subject row', () => {
    renderPanel()

    expect(container.textContent).toContain('Fix tab overflow')
    expect(commitRow(makeHistoryItem()).getAttribute('aria-label')).toContain('52ad492')
  })

  it('defaults to flat commit changes and switches between list and tree without reloading', async () => {
    const item = makeHistoryItem()
    const entries = [
      makeEntry({ path: 'src/components/Tab.tsx' }),
      makeEntry({ path: 'docs/overview.md', status: 'added' })
    ]
    const onLoadCommitFiles = vi.fn().mockResolvedValue(entries)

    renderPanel({
      state: { status: 'ready', result: makeHistoryResult([item]) },
      onLoadCommitFiles,
      onOpenCommitFile: vi.fn()
    })
    await expandCommit(item)
    expect(findCommitFilesViewAction('View as tree')).not.toBeNull()
    expect(findCommitFilesViewAction('View as list')).toBeNull()
    expect(commitFilesViewActionCount()).toBe(1)

    const files = commitFiles(item)
    expect(fileRows(files)).toHaveLength(entries.length)
    expect(directoryRows(files)).toHaveLength(0)
    expect(files.textContent).toContain('src/components')
    expect(files.textContent).toContain('docs')
    expect(onLoadCommitFiles).toHaveBeenCalledTimes(1)

    selectCommitFilesView('View as tree')
    expect(findCommitFilesViewAction('View as tree')).toBeNull()
    expect(findCommitFilesViewAction('View as list')).not.toBeNull()
    expect(commitFilesViewActionCount()).toBe(1)

    expect(directoryRows(files).map((directory) => directory.dataset.treePath)).toEqual(
      expect.arrayContaining(['src/components', 'docs'])
    )
    expect(fileRows(files)).toHaveLength(entries.length)
    expect(onLoadCommitFiles).toHaveBeenCalledTimes(1)

    selectCommitFilesView('View as list')
    expect(findCommitFilesViewAction('View as list')).toBeNull()
    expect(findCommitFilesViewAction('View as tree')).not.toBeNull()
    expect(commitFilesViewActionCount()).toBe(1)

    expect(fileRows(files)).toHaveLength(entries.length)
    expect(directoryRows(files)).toHaveLength(0)
    expect(files.textContent).toContain('src/components')
    expect(files.textContent).toContain('docs')
  })

  it('keeps the selected commit-files tree mode through a history result replacement', async () => {
    const item = makeHistoryItem()
    const entries = [
      makeEntry({ path: 'packages/app/src/index.ts' }),
      makeEntry({ path: 'packages/app/package.json', status: 'added' }),
      makeEntry({ path: 'packages/server/src/main.ts' })
    ]
    const onLoadCommitFiles = vi.fn().mockResolvedValue(entries)
    const state = { status: 'ready' as const, result: makeHistoryResult([item]) }

    renderPanel({
      state,
      onLoadCommitFiles,
      onOpenCommitFile: vi.fn()
    })
    selectCommitFilesView('View as tree')
    await expandCommit(item)

    expect(directoryRows(commitFiles(item))).toHaveLength(4)

    renderPanel({
      state: { status: 'ready', result: makeHistoryResult([item]) },
      onLoadCommitFiles,
      onOpenCommitFile: vi.fn()
    })
    expect(container.querySelector('[data-testid="git-history-commit-files"]')).toBeNull()
    await expandCommit(item)

    expect(onLoadCommitFiles).toHaveBeenCalledTimes(2)
    expect(directoryRows(commitFiles(item))).toHaveLength(4)
    expect(fileRows(commitFiles(item))).toHaveLength(entries.length)
  })

  it('routes a tree file click to its matching commit, entry, and row event', async () => {
    const first = makeHistoryItem({
      id: 'first-commit',
      displayId: 'first',
      subject: 'First commit'
    })
    const second = makeHistoryItem({
      id: 'second-commit',
      displayId: 'second',
      subject: 'Second commit'
    })
    const firstEntry = makeEntry({ path: 'src/first.ts' })
    const secondEntry = makeEntry({ path: 'src/components/Second.tsx' })
    const onOpenCommitFile = vi.fn()
    const onLoadCommitFiles = vi.fn((item: GitHistoryItem) =>
      Promise.resolve(item.id === second.id ? [secondEntry] : [firstEntry])
    )

    renderPanel({
      state: { status: 'ready', result: makeHistoryResult([first, second]) },
      onLoadCommitFiles,
      onOpenCommitFile
    })
    selectCommitFilesView('View as tree')
    await expandCommit(first)
    await expandCommit(second)

    const file = fileRows(commitFiles(second)).find((element) => element.title === secondEntry.path)
    if (!file) {
      throw new Error(`Missing file row for ${secondEntry.path}`)
    }
    act(() => {
      file.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    })

    expect(onOpenCommitFile).toHaveBeenCalledTimes(1)
    const [openedItem, openedEntry, rowEvent] = onOpenCommitFile.mock.calls[0] ?? []
    expect(openedItem).toStrictEqual(second)
    expect(openedItem).toMatchObject({ id: second.id })
    expect(openedEntry).toBe(secondEntry)
    expect(rowEvent).toEqual({
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false
    })
  })

  it('discards in-flight commit files when the retained history starts refreshing', async () => {
    const item = makeHistoryItem()
    const result = makeHistoryResult([item])
    const staleEntry = makeEntry({ path: 'src/stale.ts' })
    const refreshedEntry = makeEntry({ path: 'src/refreshed.ts' })
    let resolveFirstLoad: ((entries: GitBranchChangeEntry[]) => void) | undefined
    const firstLoad = new Promise<GitBranchChangeEntry[]>((resolve) => {
      resolveFirstLoad = resolve
    })
    const onLoadCommitFiles = vi
      .fn()
      .mockReturnValueOnce(firstLoad)
      .mockResolvedValueOnce([refreshedEntry])

    renderPanel({
      state: { status: 'ready', result },
      onLoadCommitFiles,
      onOpenCommitFile: vi.fn()
    })
    await expandCommit(item)
    expect(commitFiles(item).textContent).toContain('Loading files')

    renderPanel({
      state: { status: 'refreshing', result },
      onLoadCommitFiles,
      onOpenCommitFile: vi.fn()
    })
    expect(container.querySelector('[data-testid="git-history-commit-files"]')).toBeNull()

    renderPanel({
      state: { status: 'ready', result },
      onLoadCommitFiles,
      onOpenCommitFile: vi.fn()
    })
    await expandCommit(item)

    expect(onLoadCommitFiles).toHaveBeenCalledTimes(2)
    expect(commitFiles(item).textContent).toContain('refreshed.ts')

    const resolveStaleLoad = resolveFirstLoad
    if (!resolveStaleLoad) {
      throw new Error('Missing in-flight commit file loader')
    }
    await act(async () => {
      resolveStaleLoad([staleEntry])
      await Promise.resolve()
    })
    expect(commitFiles(item).textContent).toContain('refreshed.ts')
    expect(commitFiles(item).textContent).not.toContain('stale.ts')
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale commit-file %s after replacing the history result',
    async (outcome) => {
      const item = makeHistoryItem()
      const staleEntry = makeEntry({ path: 'src/stale.ts' })
      const currentEntry = makeEntry({ path: 'src/current.ts' })
      let settleStaleLoad: (() => void) | undefined
      const staleLoad = new Promise<GitBranchChangeEntry[]>((resolve, reject) => {
        settleStaleLoad =
          outcome === 'resolve' ? () => resolve([staleEntry]) : () => reject(new Error('stale'))
      })
      const onLoadCommitFiles = vi
        .fn()
        .mockReturnValueOnce(staleLoad)
        .mockResolvedValueOnce([currentEntry])

      renderPanel({
        state: { status: 'ready', result: makeHistoryResult([item]) },
        onLoadCommitFiles,
        onOpenCommitFile: vi.fn()
      })
      await expandCommit(item)
      expect(commitFiles(item).textContent).toContain('Loading files')

      renderPanel({
        state: { status: 'ready', result: makeHistoryResult([item]) },
        onLoadCommitFiles,
        onOpenCommitFile: vi.fn()
      })
      await expandCommit(item)
      expect(commitFiles(item).textContent).toContain('current.ts')

      const settleLoader = settleStaleLoad
      if (!settleLoader) {
        throw new Error('Missing stale commit-file loader')
      }
      await act(async () => {
        settleLoader()
        await Promise.resolve()
      })

      expect(onLoadCommitFiles).toHaveBeenCalledTimes(2)
      expect(commitFiles(item).textContent).toContain('current.ts')
      expect(commitFiles(item).textContent).not.toContain('stale.ts')
      expect(commitFiles(item).textContent).not.toContain('stale')
    }
  )

  it('keeps same-path directory collapse state isolated between expanded commits', async () => {
    const first = makeHistoryItem({
      id: 'first-commit',
      displayId: 'first',
      subject: 'First commit'
    })
    const second = makeHistoryItem({
      id: 'second-commit',
      displayId: 'second',
      subject: 'Second commit'
    })
    const entries = [
      makeEntry({ path: 'src/shared/one.ts' }),
      makeEntry({ path: 'src/shared/two.ts' })
    ]
    const onLoadCommitFiles = vi.fn().mockResolvedValue(entries)

    renderPanel({
      state: { status: 'ready', result: makeHistoryResult([first, second]) },
      onLoadCommitFiles,
      onOpenCommitFile: vi.fn()
    })
    selectCommitFilesView('View as tree')
    await expandCommit(first)
    await expandCommit(second)

    const firstFiles = commitFiles(first)
    const secondFiles = commitFiles(second)
    const firstDirectory = directoryRows(firstFiles)[0]
    const secondDirectory = directoryRows(secondFiles)[0]
    if (!firstDirectory || !secondDirectory) {
      throw new Error('Missing shared source directory')
    }
    expect(firstDirectory.dataset.treePath).toBe(secondDirectory.dataset.treePath)
    expect(fileRows(firstFiles)).toHaveLength(entries.length)
    expect(fileRows(secondFiles)).toHaveLength(entries.length)

    const toggle = firstDirectory.querySelector<HTMLButtonElement>('button')
    if (!toggle) {
      throw new Error('Missing directory toggle')
    }
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(fileRows(firstFiles)).toHaveLength(0)
    expect(fileRows(secondFiles)).toHaveLength(entries.length)
  })

  it('keeps directory collapse state when a commit row is collapsed and re-expanded', async () => {
    const item = makeHistoryItem()
    const entries = [
      makeEntry({ path: 'src/shared/one.ts' }),
      makeEntry({ path: 'src/shared/two.ts' })
    ]
    const onLoadCommitFiles = vi.fn().mockResolvedValue(entries)

    renderPanel({
      state: { status: 'ready', result: makeHistoryResult([item]) },
      onLoadCommitFiles,
      onOpenCommitFile: vi.fn()
    })
    selectCommitFilesView('View as tree')
    await expandCommit(item)

    const directory = directoryRows(commitFiles(item))[0]
    const toggle = directory?.querySelector('button')
    if (!directory || !toggle) {
      throw new Error('Missing shared source directory')
    }
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(fileRows(commitFiles(item))).toHaveLength(0)

    await expandCommit(item)
    expect(container.querySelector('[data-testid="git-history-commit-files"]')).toBeNull()

    await expandCommit(item)
    expect(onLoadCommitFiles).toHaveBeenCalledTimes(1)
    expect(fileRows(commitFiles(item))).toHaveLength(0)
    expect(
      directoryRows(commitFiles(item))[0]?.querySelector('button')?.getAttribute('aria-expanded')
    ).toBe('false')
  })

  // Why: this persisted preference applies to future commits, so empty history
  // must match the enabled changes-header action.
  it('keeps the commit-files view action enabled when there are no commits', () => {
    renderPanel({ state: { status: 'ready', result: makeHistoryResult([]) } })

    expect(commitFilesViewAction('View as tree').disabled).toBe(false)
  })
})
