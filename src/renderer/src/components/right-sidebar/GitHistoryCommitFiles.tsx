import { useMemo } from 'react'
import type React from 'react'
import { ArrowUpRight, ChevronDown, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { STATUS_COLORS, STATUS_LABELS } from './status-display'
import {
  toPermanentSourceControlRowOpenEvent,
  toSourceControlRowOpenEvent,
  type SourceControlRowOpenEvent
} from './source-control-split-open'
import {
  buildSourceControlTree,
  compactSourceControlTree,
  flattenSourceControlTree,
  namespaceSourceControlTreeDirectoryKeys,
  SOURCE_CONTROL_TREE_DIRECTORY_PADDING_PX,
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX,
  type SourceControlTreeDirectoryNode,
  type SourceControlTreeNode
} from './source-control-tree'
import { cn } from '@/lib/utils'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { basename, dirname } from '@/lib/path'
import { translate } from '@/i18n/i18n'
import { formatGitHistoryTimestamp } from './git-history-format'
import type {
  GitBranchChangeEntry,
  GitFileStatus,
  SourceControlViewMode
} from '../../../../shared/types'

// State for a single commit's lazily-loaded file list. Owned by GitHistoryPanel,
// populated through the onLoadCommitFiles loader supplied by SourceControl.
export type GitHistoryCommitFilesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: GitBranchChangeEntry[] }

type CommitTreeNode = SourceControlTreeNode<GitBranchChangeEntry, 'commit'>

function CommitFileRow({
  entry,
  onOpen,
  depth,
  showPathHint = true
}: {
  entry: GitBranchChangeEntry
  onOpen: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  depth?: number
  showPathHint?: boolean
}): React.JSX.Element {
  const status = entry.status as GitFileStatus
  const FileIcon = getFileTypeIcon(entry.path)
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = parentDir === '.' ? '' : parentDir
  const isTreeRow = depth !== undefined

  return (
    <button
      type="button"
      className={cn(
        'group flex w-full min-w-0 cursor-pointer items-center gap-1 py-1 pr-3 text-left text-xs transition-colors hover:bg-accent/40',
        !isTreeRow && 'pl-9'
      )}
      style={
        isTreeRow
          ? {
              paddingLeft: `${depth * SOURCE_CONTROL_TREE_INDENT_PX + SOURCE_CONTROL_TREE_FILE_PADDING_PX}px`
            }
          : undefined
      }
      title={entry.path}
      data-testid="git-history-commit-file"
      onClick={(event) => onOpen(entry, toSourceControlRowOpenEvent(event))}
      onDoubleClick={(event) => onOpen(entry, toPermanentSourceControlRowOpenEvent(event))}
    >
      <FileIcon className="size-3.5 shrink-0" style={{ color: STATUS_COLORS[status] }} />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-foreground">{fileName}</span>
        {showPathHint && dirPath && (
          <span className="ml-1.5 text-[11px] text-muted-foreground">{dirPath}</span>
        )}
      </span>
      <span
        className="w-4 shrink-0 text-center text-[10px] font-bold"
        style={{ color: STATUS_COLORS[status] }}
      >
        {STATUS_LABELS[status]}
      </span>
    </button>
  )
}

function CommitTreeDirectoryRow({
  node,
  isCollapsed,
  onToggle
}: {
  node: SourceControlTreeDirectoryNode<GitBranchChangeEntry, 'commit'>
  isCollapsed: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <div
      className="group relative flex w-full items-center gap-1 pr-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      style={{
        paddingLeft: `${node.depth * SOURCE_CONTROL_TREE_INDENT_PX + SOURCE_CONTROL_TREE_DIRECTORY_PADDING_PX}px`
      }}
      data-testid="git-history-commit-directory"
      data-tree-path={node.path}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
      >
        <ChevronDown
          className={cn(
            'size-3 shrink-0 transition-transform motion-reduce:transition-none',
            isCollapsed && '-rotate-90'
          )}
        />
        {isCollapsed ? (
          <Folder className="size-3 shrink-0" />
        ) : (
          <FolderOpen className="size-3 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
      <span className="w-4 shrink-0 text-center text-[10px] font-bold tabular-nums text-muted-foreground/80">
        {node.fileCount}
      </span>
    </div>
  )
}

function CommitFilesBody({
  state,
  viewMode,
  treeRows,
  collapsedTreeDirs,
  onToggleTreeDirectory,
  onOpenFile,
  onOpenAll
}: {
  state: GitHistoryCommitFilesState
  viewMode: SourceControlViewMode
  treeRows: CommitTreeNode[]
  collapsedTreeDirs: ReadonlySet<string>
  onToggleTreeDirectory: (key: string) => void
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  onOpenAll?: () => void
}): React.JSX.Element {
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-1 pl-9 pr-3 text-[11px] text-muted-foreground">
        <RefreshCw className="size-3 animate-spin" />
        <span>
          {translate(
            'auto.components.right.sidebar.GitHistoryCommitFiles.a1b2c3d4e5',
            'Loading files…'
          )}
        </span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="py-1 pl-9 pr-3 text-[11px] text-destructive" title={state.error}>
        {state.error}
      </div>
    )
  }

  if (state.entries.length === 0) {
    return (
      <div className="py-1 pl-9 pr-3 text-[11px] text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.GitHistoryCommitFiles.b2c3d4e5f6',
          'No file changes in this commit'
        )}
      </div>
    )
  }

  return (
    <>
      {viewMode === 'list'
        ? state.entries.map((entry) => (
            <CommitFileRow key={entry.path} entry={entry} onOpen={onOpenFile} />
          ))
        : treeRows.map((node) =>
            node.type === 'directory' ? (
              <CommitTreeDirectoryRow
                key={node.key}
                node={node}
                isCollapsed={collapsedTreeDirs.has(node.key)}
                onToggle={() => onToggleTreeDirectory(node.key)}
              />
            ) : (
              <CommitFileRow
                key={node.key}
                entry={node.entry}
                depth={node.depth}
                showPathHint={false}
                onOpen={onOpenFile}
              />
            )
          )}
      {onOpenAll && (
        <button
          type="button"
          className="flex w-full items-center gap-1 py-1 pl-9 pr-3 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          onClick={onOpenAll}
        >
          <ArrowUpRight className="size-3 shrink-0" />
          <span>
            {translate(
              'auto.components.right.sidebar.GitHistoryCommitFiles.c3d4e5f6a7',
              'Open all changes together'
            )}
          </span>
        </button>
      )}
    </>
  )
}

export function GitHistoryCommitFiles({
  commitId,
  viewMode,
  state,
  author,
  timestamp,
  collapsedTreeDirs,
  onToggleTreeDirectory,
  onOpenFile,
  onOpenAll
}: {
  commitId: string
  viewMode: SourceControlViewMode
  state: GitHistoryCommitFilesState
  author?: string
  timestamp?: number
  collapsedTreeDirs: ReadonlySet<string>
  onToggleTreeDirectory: (key: string) => void
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  onOpenAll?: () => void
}): React.JSX.Element {
  const commitEntries = state.status === 'ready' ? state.entries : undefined
  const treeRoots = useMemo<CommitTreeNode[]>(() => {
    if (viewMode !== 'tree' || !commitEntries) {
      return []
    }

    const compactedTree = compactSourceControlTree(buildSourceControlTree('commit', commitEntries))
    // Why: identical paths in separate commits need independent collapse state.
    return namespaceSourceControlTreeDirectoryKeys(compactedTree, `commit:${commitId}`)
  }, [commitEntries, commitId, viewMode])
  const treeRows = useMemo(
    () => (viewMode === 'tree' ? flattenSourceControlTree(treeRoots, collapsedTreeDirs) : []),
    [collapsedTreeDirs, treeRoots, viewMode]
  )

  // Author and date move off the dense commit row and surface here on expand.
  const meta = [author, formatGitHistoryTimestamp(timestamp)].filter(Boolean).join(' · ')

  return (
    <div
      className="border-l border-border/60 bg-muted/20"
      data-testid="git-history-commit-files"
      data-commit-id={commitId}
    >
      {meta && <div className="py-1 pl-9 pr-3 text-[11px] text-muted-foreground">{meta}</div>}
      <CommitFilesBody
        state={state}
        viewMode={viewMode}
        treeRows={treeRows}
        collapsedTreeDirs={collapsedTreeDirs}
        onToggleTreeDirectory={onToggleTreeDirectory}
        onOpenFile={onOpenFile}
        onOpenAll={onOpenAll}
      />
    </div>
  )
}
