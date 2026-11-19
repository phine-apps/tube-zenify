import React, { useState, useMemo } from 'react'
import { useDrop } from 'react-dnd'
import { ItemTypes } from '../constants'
import { useZen } from '../context/useZen'
import Folder from './Folder'
import ChannelItem from './ChannelItem'
import clsx from 'clsx'
import {
  Inbox,
  ChevronsUpDown,
  ChevronsDownUp,
  ArrowUpDown,
  CheckSquare,
  FolderInput,
  X,
} from 'lucide-react'

const FolderTree = () => {
  const {
    folderStructure,
    availableFolders,
    moveItem,
    moveItemsBatch,
    searchTerm,
    statusFilter,
    sortBy,
    setSortBy,
    toggleAllFolders,
    items,
    activeTab,
    isConnecting,
  } = useZen()
  const [isUncategorizedOpen, setIsUncategorizedOpen] = useState(true)
  const [batchState, setBatchState] = useState(() => ({
    tab: activeTab,
    enabled: false,
    selectedIds: new Set(),
    targetFolderId: '',
  }))

  const isBatchMode = batchState.tab === activeTab && batchState.enabled
  const selectedBatchIds = useMemo(
    () => (batchState.tab === activeTab ? batchState.selectedIds : new Set()),
    [batchState.tab, batchState.selectedIds, activeTab]
  )
  const effectiveTargetFolderId = useMemo(() => {
    if (availableFolders.length === 0) return ''
    if (
      batchState.tab === activeTab &&
      availableFolders.some((f) => f.id === batchState.targetFolderId)
    ) {
      return batchState.targetFolderId
    }
    return availableFolders[0].id
  }, [availableFolders, batchState.tab, batchState.targetFolderId, activeTab])

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: [ItemTypes.CHANNEL, ItemTypes.PLAYLIST, ItemTypes.FOLDER],
      drop: (item, monitor) => {
        if (monitor.didDrop()) return
        moveItem(item.id, 'root')
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
      }),
    }),
    [moveItem]
  )

  const visibleUncategorizedIds = useMemo(
    () =>
      folderStructure.uncategorized
        .map((item) => (typeof item === 'string' ? item : item.id))
        .filter((id) => Boolean(items[id])),
    [folderStructure.uncategorized, items]
  )

  const toggleSelectBatchItem = (id) => {
    setBatchState((prev) => {
      const base = prev.tab === activeTab ? prev.selectedIds : new Set()
      const next = new Set(base)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, tab: activeTab, selectedIds: next }
    })
  }

  const handleToggleSelectAll = () => {
    const allSelected =
      visibleUncategorizedIds.length > 0 &&
      visibleUncategorizedIds.every((id) => selectedBatchIds.has(id))
    setBatchState((prev) => ({
      ...prev,
      tab: activeTab,
      selectedIds: allSelected ? new Set() : new Set(visibleUncategorizedIds),
    }))
  }

  const handleBatchMove = () => {
    if (!effectiveTargetFolderId || selectedBatchIds.size === 0) return
    moveItemsBatch(Array.from(selectedBatchIds), effectiveTargetFolderId)
    setBatchState((prev) => ({
      ...prev,
      tab: activeTab,
      selectedIds: new Set(),
    }))
  }

  const isEmpty =
    folderStructure.root.length === 0 &&
    folderStructure.uncategorized.length === 0
  const hasFilterActive =
    Boolean(searchTerm.trim()) ||
    (activeTab === 'channels' && statusFilter !== 'all')

  const noResultsMessage =
    activeTab === 'playlists'
      ? chrome.i18n.getMessage('noPlaylistSearchResults') ||
        'No matching playlists found.'
      : chrome.i18n.getMessage('noSearchResults') ||
        'No matching channels found.'

  const uncategorizedCount = visibleUncategorizedIds.length

  const hasAnyItems =
    folderStructure.root.length > 0 || folderStructure.uncategorized.length > 0

  return (
    <div
      ref={drop}
      className={clsx(
        'flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 transition-colors rounded-lg',
        isOver && 'bg-zen-accent/5 ring-1 ring-zen-accent/50'
      )}
    >
      {/* Search / Filter Empty State */}
      {hasFilterActive && isEmpty && (
        <div className="flex flex-col items-center justify-center py-10 text-zen-muted opacity-60 space-y-2">
          <span className="text-xs">{noResultsMessage}</span>
        </div>
      )}

      {/* Toolbar: Expand/Collapse & Sort */}
      {hasAnyItems && (
        <div
          className="flex items-center justify-between gap-2 mb-2 px-1"
          onClick={(e) => e.stopPropagation()}
        >
          {!hasFilterActive && folderStructure.root.length > 0 ? (
            (() => {
              const hasExpanded = folderStructure.root.some(
                function check(node) {
                  if (typeof node === 'string') return false
                  if (node.type === 'folder') {
                    if (node.expanded) return true
                    if (node.children && node.children.some(check)) return true
                  }
                  return false
                }
              )

              return (
                <button
                  onClick={() => toggleAllFolders(!hasExpanded)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zen-muted hover:text-zen-accent hover:bg-zen-accent/5 rounded-lg transition-all group"
                  title={
                    hasExpanded
                      ? chrome.i18n.getMessage('collapseAll') || 'Collapse All'
                      : chrome.i18n.getMessage('expandAll') || 'Expand All'
                  }
                >
                  <div className="text-zen-muted group-hover:text-zen-accent transition-colors">
                    {hasExpanded ? (
                      <ChevronsDownUp size={13} />
                    ) : (
                      <ChevronsUpDown size={13} />
                    )}
                  </div>
                  <span>
                    {hasExpanded
                      ? chrome.i18n.getMessage('collapseAll') || 'Collapse All'
                      : chrome.i18n.getMessage('expandAll') || 'Expand All'}
                  </span>
                </button>
              )
            })()
          ) : (
            <div />
          )}

          <div className="flex items-center gap-1 text-[11px] text-zen-muted">
            <ArrowUpDown size={12} className="shrink-0" />
            <select
              value={
                activeTab === 'playlists' && sortBy === 'status'
                  ? 'name'
                  : sortBy
              }
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-[11px] font-medium text-zen-muted hover:text-zen-text focus:outline-none cursor-pointer pr-1"
              aria-label={chrome.i18n.getMessage('sortLabel') || 'Sort order'}
            >
              <option value="manual">
                {chrome.i18n.getMessage('sortManual') || 'Manual'}
              </option>
              <option value="name">
                {chrome.i18n.getMessage('sortName') || 'Name (A-Z)'}
              </option>
              {activeTab === 'channels' && (
                <option value="status">
                  {chrome.i18n.getMessage('sortStatus') || 'Live & New first'}
                </option>
              )}
            </select>
          </div>
        </div>
      )}

      {/* Root Folders Section */}
      <div className="space-y-1 mb-4">
        {!hasFilterActive && folderStructure.root.length === 0 && (
          <div className="text-center text-xs text-zen-muted py-6 italic select-none">
            {chrome.i18n.getMessage('noFolders') ||
              'Create a folder to start organizing'}
          </div>
        )}
        {folderStructure.root
          .filter((f) => typeof f === 'object' && f.type === 'folder')
          .map((folder) => (
            <Folder key={folder.id} folder={folder} />
          ))}
      </div>

      {/* Empty Playlists State */}
      {!hasFilterActive &&
        activeTab === 'playlists' &&
        !isConnecting &&
        Object.keys(items).length === 0 &&
        folderStructure.root.length === 0 && (
          <div className="text-center text-xs text-zen-muted py-4 px-2 leading-relaxed select-none">
            {chrome.i18n.getMessage('noPlaylistsFound') ||
              'No created or saved playlists found yet.'}
          </div>
        )}

      {/* Uncategorized / Inbox Section */}
      <div className="mt-2">
        {folderStructure.uncategorized.length > 0 && (
          <div className="animate-fade-in">
            <div
              className="sticky top-0 z-10 bg-zen-bg/95 backdrop-blur-sm flex items-center gap-2 px-3 py-2 mb-2 text-zen-muted font-bold text-[11px] uppercase tracking-widest cursor-pointer hover:text-zen-accent group transition-colors border-b border-zen-border"
              onClick={() => setIsUncategorizedOpen(!isUncategorizedOpen)}
              onDoubleClick={() => setIsUncategorizedOpen(!isUncategorizedOpen)}
            >
              <Inbox
                size={14}
                className="group-hover:scale-110 transition-transform"
              />
              <span>
                {chrome.i18n.getMessage('folderUncategorized') ||
                  'Uncategorized'}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {uncategorizedCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      const next = !isBatchMode
                      setBatchState({
                        tab: activeTab,
                        enabled: next,
                        selectedIds: new Set(),
                        targetFolderId: effectiveTargetFolderId,
                      })
                      if (next) setIsUncategorizedOpen(true)
                    }}
                    className={clsx(
                      'p-1 rounded-md transition-colors',
                      isBatchMode
                        ? 'bg-zen-accent text-white'
                        : 'text-zen-muted hover:text-zen-accent hover:bg-zen-accent/10'
                    )}
                    title={
                      chrome.i18n.getMessage('batchOrganize') ||
                      'Select multiple to move'
                    }
                  >
                    {isBatchMode ? <X size={12} /> : <CheckSquare size={12} />}
                  </button>
                )}
                <span className="bg-zen-surface border border-zen-border text-zen-muted group-hover:bg-zen-accent/10 group-hover:text-zen-accent rounded-full px-2 py-0.5 text-[10px] transition-colors">
                  {uncategorizedCount}
                </span>
              </div>
            </div>

            {isUncategorizedOpen && (
              <>
                {isBatchMode && (
                  <div
                    className="mb-2 p-2 bg-zen-surface border border-zen-border rounded-xl shadow-2xs space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="font-semibold text-zen-accent hover:underline"
                      >
                        {visibleUncategorizedIds.length > 0 &&
                        visibleUncategorizedIds.every((id) =>
                          selectedBatchIds.has(id)
                        )
                          ? chrome.i18n.getMessage('batchDeselectAll') ||
                            'Deselect all'
                          : chrome.i18n.getMessage('batchSelectAll') ||
                            'Select all'}
                      </button>
                      <span className="text-zen-muted">
                        {selectedBatchIds.size}{' '}
                        {chrome.i18n.getMessage('batchSelected') || 'selected'}
                      </span>
                    </div>

                    {availableFolders.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={effectiveTargetFolderId}
                          onChange={(e) =>
                            setBatchState((prev) => ({
                              ...prev,
                              tab: activeTab,
                              targetFolderId: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-0 bg-zen-bg border border-zen-border rounded-lg px-2 py-1.5 text-xs text-zen-text focus:outline-none focus:ring-1 focus:ring-zen-accent"
                        >
                          {availableFolders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleBatchMove}
                          disabled={selectedBatchIds.size === 0}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zen-accent text-white hover:bg-zen-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                        >
                          <FolderInput size={13} />
                          <span>
                            {chrome.i18n.getMessage('batchMove') || 'Move'}
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zen-muted italic">
                        {chrome.i18n.getMessage('noFolders') ||
                          'Create a folder to start organizing'}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1 animate-slide-up pb-4">
                  {folderStructure.uncategorized.map((item) => {
                    const itemId = typeof item === 'string' ? item : item.id
                    return (
                      <ChannelItem
                        key={itemId}
                        id={itemId}
                        isUncategorized
                        isBatchMode={isBatchMode}
                        isSelected={selectedBatchIds.has(itemId)}
                        onToggleSelect={toggleSelectBatchItem}
                      />
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default FolderTree
