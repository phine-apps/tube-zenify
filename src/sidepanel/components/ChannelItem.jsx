import React, { useState } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { ItemTypes } from '../constants'
import clsx from 'clsx'
import { ListVideo, Check } from 'lucide-react'
import { useZen } from '../context/useZen'
import { openYouTubeUrl, resolveChannelUrl } from '../../utils/navigation'

const DEFAULT_AVATAR =
  'https://www.gstatic.com/youtube/img/channels/default_profile_picture_default.png'

const ChannelItem = ({
  id,
  isUncategorized: _isUncategorized,
  isBatchMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const { items, activeTab, moveItem, openChannelTab } = useZen()
  const itemData = items[id]
  const dropRef = React.useRef(null)
  const [dropPosition, setDropPosition] = useState(null) // 'before' | 'after' | null
  const [failedIconUrl, setFailedIconUrl] = useState(null)
  const imgError = Boolean(itemData?.icon && failedIconUrl === itemData.icon)

  const isPlaylist = activeTab === 'playlists'
  const dragType = isPlaylist ? ItemTypes.PLAYLIST : ItemTypes.CHANNEL

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: dragType,
      item: { id, type: dragType },
      canDrag: () => !isBatchMode,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [id, dragType, isBatchMode]
  )

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: [ItemTypes.CHANNEL, ItemTypes.PLAYLIST, ItemTypes.FOLDER],
      canDrop: () => !isBatchMode,
      hover: (item, monitor) => {
        if (isBatchMode || !dropRef.current) return
        if (item.id === id) {
          setDropPosition(null)
          return
        }

        const clientOffset = monitor.getClientOffset()
        if (!clientOffset) return
        const hoverBoundingRect = dropRef.current.getBoundingClientRect()
        const hoverMiddleY =
          (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
        const hoverClientY = clientOffset.y - hoverBoundingRect.top

        setDropPosition(hoverClientY < hoverMiddleY ? 'before' : 'after')
      },
      drop: (item, monitor) => {
        if (isBatchMode || monitor.didDrop()) return
        if (item.id === id) return
        if (!dropRef.current) return

        const clientOffset = monitor.getClientOffset()
        if (!clientOffset) return
        const hoverBoundingRect = dropRef.current.getBoundingClientRect()
        const hoverMiddleY =
          (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
        const hoverClientY = clientOffset.y - hoverBoundingRect.top
        const pos = hoverClientY < hoverMiddleY ? 'before' : 'after'

        moveItem(item.id, id, pos)
        setDropPosition(null)
      },
      collect: (monitor) => ({
        isOver: !isBatchMode && monitor.isOver({ shallow: true }),
      }),
    }),
    [id, moveItem, isBatchMode]
  )

  const combinedRef = (node) => {
    drag(drop(node))
    dropRef.current = node
  }

  if (!itemData) return null

  const targetUrl = isPlaylist
    ? itemData.url || `https://www.youtube.com/playlist?list=${id}`
    : resolveChannelUrl(itemData.url, id, openChannelTab)

  const handleOpen = (e) => {
    e.stopPropagation()
    if (isBatchMode && onToggleSelect) {
      onToggleSelect(id)
      return
    }
    openYouTubeUrl(targetUrl, e)
  }

  return (
    <div className="relative group/channel">
      {/* Drop Line Indicators */}
      {isOver && dropPosition === 'before' && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-zen-accent animate-pulse z-20 rounded-full" />
      )}

      <div
        ref={combinedRef}
        onClick={handleOpen}
        onAuxClick={(e) => {
          if (!isBatchMode && e.button === 1) handleOpen(e)
        }}
        className={clsx(
          'flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-200',
          isBatchMode && isSelected
            ? 'bg-zen-accent/10 border border-zen-accent/40'
            : 'hover:bg-zen-surface hover:shadow-sm border border-transparent hover:border-zen-border',
          isDragging ? 'opacity-40 scale-95' : 'opacity-100 scale-100',
          isOver && 'ring-1 ring-zen-accent/20'
        )}
      >
        {isBatchMode && (
          <div
            className={clsx(
              'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
              isSelected
                ? 'bg-zen-accent border-zen-accent text-white'
                : 'border-zen-muted/60 bg-zen-surface'
            )}
          >
            {isSelected && <Check size={11} strokeWidth={3} />}
          </div>
        )}

        <div className="relative shrink-0">
          {isPlaylist ? (
            itemData.icon && !imgError ? (
              <img
                src={itemData.icon}
                alt={itemData.name}
                className="w-10 h-7 rounded-md object-cover bg-zen-border/50 shadow-sm group-hover/channel:scale-105 transition-transform"
                onError={() => setFailedIconUrl(itemData.icon)}
              />
            ) : (
              <div className="w-10 h-7 rounded-md bg-zen-accent/10 text-zen-accent flex items-center justify-center shadow-2xs group-hover/channel:scale-105 transition-transform">
                <ListVideo size={15} />
              </div>
            )
          ) : (
            <>
              <img
                src={itemData.icon || DEFAULT_AVATAR}
                alt={itemData.name}
                className="w-8 h-8 rounded-full object-cover bg-gray-100 shadow-sm group-hover/channel:scale-105 transition-transform"
                onError={(e) => {
                  e.currentTarget.onerror = null
                  if (e.currentTarget.src !== DEFAULT_AVATAR) {
                    e.currentTarget.src = DEFAULT_AVATAR
                  }
                }}
              />
              {itemData.isLive && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-zen-live border-2 border-zen-surface rounded-full animate-pulse-slow ml-auto"
                  title={chrome.i18n.getMessage('badgeLive') || 'LIVE'}
                ></span>
              )}
              {itemData.hasNewContent && !itemData.isLive && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-blue-500 border-2 border-zen-surface rounded-full"
                  title={
                    chrome.i18n.getMessage('badgeNewContent') || 'New Content'
                  }
                ></span>
              )}
            </>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zen-text truncate group-hover/channel:text-zen-text-secondary">
            {itemData.name}
          </div>
          {isPlaylist && itemData.videoCount && (
            <div className="text-[11px] text-zen-muted truncate">
              {itemData.videoCount}
            </div>
          )}
        </div>
      </div>

      {isOver && dropPosition === 'after' && (
        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-zen-accent animate-pulse z-20 rounded-full" />
      )}
    </div>
  )
}

export default ChannelItem
