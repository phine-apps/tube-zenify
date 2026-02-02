import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useDrop, useDrag } from 'react-dnd'
import { ItemTypes } from '../constants'
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderOpen,
  Trash2,
  Edit2,
  X,
  Check,
} from 'lucide-react'
import clsx from 'clsx'
import ChannelItem from './ChannelItem'

import { useZen } from '../context/useZen'

const Folder = ({ folder }) => {
  const {
    moveItem,
    renameFolder,
    deleteFolder,
    channels,
    selectedFolderId,
    selectFolder,
    toggleFolder,
  } = useZen()
  const isOpen = folder.expanded || false
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const inputRef = useRef(null)

  const hasLiveChannel = useMemo(() => {
    const checkLive = (nodes) => {
      if (!nodes || !Array.isArray(nodes)) return false
      return nodes.some((node) => {
        if (typeof node === 'string') {
          return channels[node]?.isLive
        }
        if (node.type === 'channel') {
          return channels[node.id]?.isLive
        }
        if (node.type === 'folder') {
          return checkLive(node.children)
        }
        return false
      })
    }
    return checkLive(folder.children)
  }, [folder.children, channels])

  const hasNewContent = useMemo(() => {
    const checkNew = (nodes) => {
      if (!nodes || !Array.isArray(nodes)) return false
      return nodes.some((node) => {
        if (typeof node === 'string') {
          const ch = channels[node]
          return ch?.hasNewContent && !ch?.isLive
        }
        if (node.type === 'channel') {
          const ch = channels[node.id]
          return ch?.hasNewContent && !ch?.isLive
        }
        if (node.type === 'folder') {
          return checkNew(node.children)
        }
        return false
      })
    }
    return checkNew(folder.children)
  }, [folder.children, channels])

  const channelCount = useMemo(() => {
    const countChannels = (nodes) => {
      if (!nodes || !Array.isArray(nodes)) return 0
      const foundChannelIds = new Set()

      const collectChannelIds = (nodes) => {
        if (!nodes || !Array.isArray(nodes)) return
        nodes.forEach((node) => {
          if (typeof node === 'string') {
            // String ID means it's a channel - only count if it exists in channels
            if (channels[node]) {
              foundChannelIds.add(node)
            }
          } else if (node.type === 'channel') {
            // Only count if it exists in channels
            if (channels[node.id]) {
              foundChannelIds.add(node.id)
            }
          } else if (node.type === 'folder') {
            // Recursively collect channels in subfolders
            collectChannelIds(node.children)
          }
        })
      }

      collectChannelIds(nodes)
      return foundChannelIds.size
    }
    return countChannels(folder.children)
  }, [folder.children, channels])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: ItemTypes.FOLDER,
      item: { id: folder.id, type: ItemTypes.FOLDER },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [folder.id]
  )

  const dropRef = useRef(null)
  const [dropPosition, setDropPosition] = useState(null) // 'before' | 'after' | 'inside' | null

  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.CHANNEL, ItemTypes.FOLDER],
    hover: (item, monitor) => {
      if (!dropRef.current) return
      if (item.id === folder.id) {
        setDropPosition(null)
        return
      }

      const hoverBoundingRect = dropRef.current.getBoundingClientRect()
      const clientOffset = monitor.getClientOffset()
      const hoverClientY = clientOffset.y - hoverBoundingRect.top
      const height = hoverBoundingRect.bottom - hoverBoundingRect.top

      // Three zones: Top 25% (before), Middle 50% (inside), Bottom 25% (after)
      if (hoverClientY < height * 0.25) {
        setDropPosition('before')
      } else if (hoverClientY > height * 0.75) {
        setDropPosition('after')
      } else {
        setDropPosition('inside')
      }
    },
    drop: (item, monitor) => {
      if (monitor.didDrop()) return
      if (item.id === folder.id) return
      const hoverBoundingRect = dropRef.current.getBoundingClientRect()
      const clientOffset = monitor.getClientOffset()
      const hoverClientY = clientOffset.y - hoverBoundingRect.top
      const height = hoverBoundingRect.bottom - hoverBoundingRect.top

      let pos = 'inside'
      if (hoverClientY < height * 0.25) pos = 'before'
      else if (hoverClientY > height * 0.75) pos = 'after'

      moveItem(item.id, folder.id, pos)
      setDropPosition(null)
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }))

  const combinedRef = (node) => {
    drag(drop(node))
    dropRef.current = node
  }

  // No longer need this effect to sync isOver and dropPosition
  // We'll use isOver in the render logic to decide whether to show the indicators

  const toggleOpen = (e) => {
    e.stopPropagation()
    if (isEditing) return
    toggleFolder(folder.id, !isOpen)
  }

  const handleSelect = (e) => {
    e.stopPropagation()
    selectFolder(folder.id === selectedFolderId ? null : folder.id)
  }

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== folder.name) {
      renameFolder(folder.id, editName.trim())
    } else {
      setEditName(folder.name)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setEditName(folder.name)
      setIsEditing(false)
    }
  }

  return (
    <div
      className={clsx(
        'relative mb-1 transition-opacity',
        isDragging ? 'opacity-40' : 'opacity-100'
      )}
    >
      {/* Drop Line Indicators */}
      {isOver && dropPosition === 'before' && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-zen-accent animate-pulse z-20 rounded-full" />
      )}

      <div
        ref={combinedRef}
        onClick={handleSelect}
        onDoubleClick={toggleOpen}
        className={clsx(
          'flex items-center gap-2 p-2 rounded-lg cursor-pointer select-none transition-all duration-200 group relative',
          isOver && dropPosition === 'inside'
            ? 'bg-zen-accent/10 ring-1 ring-zen-accent text-zen-accent'
            : selectedFolderId === folder.id
              ? 'bg-zen-accent/10 ring-1 ring-zen-accent/50 text-zen-accent'
              : 'hover:bg-zen-surface hover:shadow-sm text-zen-text hover:text-zen-text-secondary border border-transparent hover:border-zen-border',
          isEditing && 'bg-zen-surface ring-1 ring-zen-border'
        )}
      >
        <div
          className="text-zen-muted transition-transform duration-200 hover:text-zen-accent p-0.5 rounded-full hover:bg-zen-surface cursor-pointer"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          onClick={toggleOpen}
          onDoubleClick={(e) => e.stopPropagation()}
          draggable={true}
          onDragStart={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <ChevronRight size={16} />
        </div>
        <div
          className={clsx(
            'transition-colors',
            isOver ? 'text-zen-accent' : 'text-yellow-500'
          )}
        >
          {isOpen ? (
            <FolderOpen size={20} fill="currentColor" />
          ) : (
            <FolderIcon size={20} fill="currentColor" />
          )}
        </div>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-white dark:bg-zen-bg border border-zen-border rounded px-1 text-sm outline-none focus:ring-1 focus:ring-zen-accent"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-sm font-semibold flex-1 truncate">
            {folder.name}
          </span>
        )}

        {!isEditing && (
          <>
            <span className="text-xs text-zen-muted font-medium bg-zen-surface px-1.5 py-0.5 rounded-full border border-zen-border flex items-center gap-1.5">
              {hasLiveChannel && !isOpen && (
                <span
                  className="w-2 h-2 bg-zen-live rounded-full animate-pulse-slow"
                  title={chrome.i18n.getMessage('badgeLive') || 'LIVE'}
                ></span>
              )}
              {hasNewContent && !isOpen && (
                <span
                  className="w-2 h-2 bg-blue-500 rounded-full"
                  title={
                    chrome.i18n.getMessage('badgeNewContent') || 'New Content'
                  }
                ></span>
              )}
              {channelCount}
            </span>
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1 hover:bg-zen-accent/10 text-gray-300 hover:text-zen-accent rounded transition-all"
                title={chrome.i18n.getMessage('renameFolder') || 'Rename'}
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditing(true)
                }}
              >
                <Edit2 size={12} />
              </button>
              <button
                className="p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded transition-all"
                title={chrome.i18n.getMessage('deleteFolder') || 'Delete'}
                onClick={(e) => {
                  e.stopPropagation()
                  if (
                    confirm(
                      chrome.i18n.getMessage('confirmDeleteFolder') ||
                        'Delete this folder? Channels will be moved to Uncategorized.'
                    )
                  ) {
                    deleteFolder(folder.id)
                  }
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>

      {isOver && dropPosition === 'after' && (
        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-zen-accent animate-pulse z-20 rounded-full" />
      )}

      {/* Children */}
      {isOpen && folder.children && (
        <div className="ml-3 pl-3 border-l-2 border-zen-border space-y-1 mt-1">
          {folder.children.map((child, _index) => {
            // Handle both full objects and simple ID strings
            const childId = typeof child === 'string' ? child : child.id
            const type = typeof child === 'string' ? 'channel' : child.type
            const childFolder =
              typeof child === 'object' && child.type === 'folder'
                ? child
                : null

            if (type === 'folder' && childFolder) {
              return <Folder key={childId} folder={childFolder} />
            } else {
              return <ChannelItem key={childId} id={childId} />
            }
          })}
        </div>
      )}
    </div>
  )
}

export default Folder
