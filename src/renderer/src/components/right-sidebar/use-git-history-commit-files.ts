import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitHistoryItem, GitHistoryResult } from '../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import type { GitHistoryCommitFilesState } from './GitHistoryCommitFiles'

type GitHistoryPanelStatus = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error'

// Owns expansion, lazy file loads, and tree-collapse state for the commit rows
// of the Git History panel.
export function useGitHistoryCommitFiles({
  result,
  stateStatus,
  onLoadCommitFiles
}: {
  result: GitHistoryResult | undefined
  stateStatus: GitHistoryPanelStatus
  onLoadCommitFiles?: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
}): {
  expanded: ReadonlySet<string>
  filesByCommit: Record<string, GitHistoryCommitFilesState>
  collapsedCommitTreeDirs: ReadonlySet<string>
  resetCommitFiles: () => void
  handleToggleExpand: (item: GitHistoryItem) => void
  handleToggleCommitTreeDirectory: (key: string) => void
} {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [filesByCommit, setFilesByCommit] = useState<Record<string, GitHistoryCommitFilesState>>({})
  // Lives in the panel hook, not in GitHistoryCommitFiles: that component unmounts
  // when its commit row collapses while the cached file list survives, so the
  // tree's collapse state must survive too. Keys are namespaced per commit.
  const [collapsedCommitTreeDirs, setCollapsedCommitTreeDirs] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  // Tracks commits whose files have been loaded (or are in flight) so re-expanding
  // never refetches; an entry is cleared on error to allow a retry.
  const loadedCommitsRef = useRef<Set<string>>(new Set())
  // Bump this before each cache reset so promises created for an older result
  // cannot write stale commit files back into the newly rendered history.
  const commitFilesGenerationRef = useRef(0)

  const resetCommitFiles = useCallback((): void => {
    commitFilesGenerationRef.current += 1
    setExpanded(new Set())
    setFilesByCommit({})
    setCollapsedCommitTreeDirs(new Set())
    loadedCommitsRef.current = new Set()
  }, [])

  // A new history result can reorder or replace commits, so drop any expansion
  // and cached file lists rather than risk showing stale files under a row.
  useEffect(() => {
    resetCommitFiles()
  }, [resetCommitFiles, result])

  // Refreshing keeps the prior graph visible while its replacement is loading.
  useEffect(() => {
    if (stateStatus === 'refreshing') {
      resetCommitFiles()
    }
  }, [resetCommitFiles, stateStatus])

  const handleToggleExpand = useCallback(
    (item: GitHistoryItem): void => {
      const id = item.id
      const willExpand = !expanded.has(id)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (willExpand) {
          next.add(id)
        } else {
          next.delete(id)
        }
        return next
      })
      if (!willExpand || !onLoadCommitFiles || loadedCommitsRef.current.has(id)) {
        return
      }
      loadedCommitsRef.current.add(id)
      const generation = commitFilesGenerationRef.current
      setFilesByCommit((prev) => ({ ...prev, [id]: { status: 'loading' } }))
      onLoadCommitFiles(item)
        .then((entries) => {
          if (commitFilesGenerationRef.current !== generation) {
            return
          }
          setFilesByCommit((prev) => ({ ...prev, [id]: { status: 'ready', entries } }))
        })
        .catch((error: unknown) => {
          if (commitFilesGenerationRef.current !== generation) {
            return
          }
          loadedCommitsRef.current.delete(id)
          setFilesByCommit((prev) => ({
            ...prev,
            [id]: {
              status: 'error',
              error:
                error instanceof Error
                  ? error.message
                  : translate(
                      'auto.components.right.sidebar.GitHistoryPanel.6d1e0a7c3b',
                      'Failed to load commit files'
                    )
            }
          }))
        })
    },
    [expanded, onLoadCommitFiles]
  )

  const handleToggleCommitTreeDirectory = useCallback((key: string): void => {
    setCollapsedCommitTreeDirs((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  return {
    expanded,
    filesByCommit,
    collapsedCommitTreeDirs,
    resetCommitFiles,
    handleToggleExpand,
    handleToggleCommitTreeDirectory
  }
}
