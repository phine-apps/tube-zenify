import React, { useState } from 'react'
import { useDrop } from 'react-dnd'
import { ItemTypes } from '../constants'
import { useZen } from '../context/useZen'
import Folder from './Folder'
import ChannelItem from './ChannelItem'
import clsx from 'clsx'
import { Inbox, ChevronsUpDown, ChevronsDownUp } from 'lucide-react'

const FolderTree = () => {
  const { folderStructure, moveItem, searchTerm, toggleAllFolders, channels } =
    useZen()
  const [isUncategorizedOpen, setIsUncategorizedOpen] = useState(true)

  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.FOLDER, ItemTypes.CHANNEL],
    drop: (item, monitor) => {
      if (monitor.didDrop()) return
      moveItem(item.id, 'root')
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }))

  const isEmpty =
    folderStructure.root.length === 0 &&
    folderStructure.uncategorized.length === 0

  return (
    <div
      ref={drop}
      className={clsx(
        'flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 transition-colors rounded-lg',
        isOver && 'bg-zen-accent/5 ring-1 ring-zen-accent/50'
      )}
    >
      {/* Search Empty State */}
      {searchTerm && isEmpty && (
        <div className="flex flex-col items-center justify-center py-10 text-zen-muted opacity-50 space-y-2">
          <span className="text-xs">
            {chrome.i18n.getMessage('noSearchResults') ||
              'No matching channels found.'}
          </span>
        </div>
      )}

      {/* Bulk Actions */}
      {!searchTerm && folderStructure.root.length > 0 && (
        <div className="flex items-center gap-1 mb-2 px-1">
          {(() => {
            const hasExpanded = folderStructure.root.some(function check(node) {
              if (typeof node === 'string') return false
              if (node.type === 'folder') {
                if (node.expanded) return true
                if (node.children && node.children.some(check)) return true
              }
              return false
            })

            return (
              <button
                onClick={() => toggleAllFolders(!hasExpanded)}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zen-muted hover:text-zen-accent hover:bg-zen-accent/5 rounded-lg transition-all group"
                title={
                  hasExpanded
                    ? chrome.i18n.getMessage('collapseAll') || 'Collapse All'
                    : chrome.i18n.getMessage('expandAll') || 'Expand All'
                }
              >
                <div className="text-zen-muted group-hover:text-zen-accent transition-colors">
                  {hasExpanded ? (
                    <ChevronsDownUp size={14} />
                  ) : (
                    <ChevronsUpDown size={14} />
                  )}
                </div>
                <span>
                  {hasExpanded
                    ? chrome.i18n.getMessage('collapseAll') || 'Collapse All'
                    : chrome.i18n.getMessage('expandAll') || 'Expand All'}
                </span>
              </button>
            )
          })()}
        </div>
      )}

      {/* Root Folders Section */}
      <div className="space-y-1 mb-4">
        {!searchTerm && folderStructure.root.length === 0 && (
          <div className="text-center text-xs text-zen-muted py-8 italic select-none">
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
              <span className="ml-auto bg-zen-surface border border-zen-border text-zen-muted group-hover:bg-zen-accent/10 group-hover:text-zen-accent rounded-full px-2 py-0.5 text-[10px] transition-colors">
                {
                  folderStructure.uncategorized.filter((item) => {
                    const itemId = typeof item === 'string' ? item : item.id
                    return channels[itemId]
                  }).length
                }
              </span>
            </div>

            {isUncategorizedOpen && (
              <div className="space-y-1 animate-slide-up pb-4">
                {folderStructure.uncategorized.map((item) => (
                  <ChannelItem key={item.id} id={item.id} isUncategorized />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default FolderTree
