import React from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { ItemTypes } from '../constants'
import clsx from 'clsx'
import { useZen } from '../context/useZen'

const ChannelItem = ({ id, isUncategorized: _isUncategorized }) => {
  const { channels, moveItem } = useZen()
  const channel = channels[id]
  const dropRef = React.useRef(null)
  const [dropPosition, setDropPosition] = React.useState(null) // 'before' | 'after' | null

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: ItemTypes.CHANNEL,
      item: { id, type: ItemTypes.CHANNEL },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [id]
  )

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: [ItemTypes.CHANNEL, ItemTypes.FOLDER],
      hover: (item, monitor) => {
        if (!dropRef.current) return
        if (item.id === id) {
          setDropPosition(null)
          return
        }

        const hoverBoundingRect = dropRef.current.getBoundingClientRect()
        const hoverMiddleY =
          (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
        const clientOffset = monitor.getClientOffset()
        const hoverClientY = clientOffset.y - hoverBoundingRect.top

        setDropPosition(hoverClientY < hoverMiddleY ? 'before' : 'after')
      },
      drop: (item, monitor) => {
        if (monitor.didDrop()) return
        if (item.id === id) return

        const hoverBoundingRect = dropRef.current.getBoundingClientRect()
        const hoverMiddleY =
          (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
        const clientOffset = monitor.getClientOffset()
        const hoverClientY = clientOffset.y - hoverBoundingRect.top
        const pos = hoverClientY < hoverMiddleY ? 'before' : 'after'

        moveItem(item.id, id, pos)
        setDropPosition(null)
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
      }),
    }),
    [id, moveItem]
  )

  const combinedRef = (node) => {
    drag(drop(node))
    dropRef.current = node
  }

  // Reset drop position when drag leaves
  React.useEffect(() => {
    if (!isOver) setDropPosition(null)
  }, [isOver])

  if (!channel) return null

  return (
    <div className="relative group/channel">
      {/* Drop Line Indicators */}
      {isOver && dropPosition === 'before' && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-zen-accent animate-pulse z-20 rounded-full" />
      )}

      <div
        ref={combinedRef}
        onClick={() => {
          if (channel.url) {
            chrome.tabs.update(undefined, { url: channel.url })
          } else {
            chrome.tabs.update(undefined, {
              url: `https://www.youtube.com/channel/${id}`,
            })
          }
        }}
        className={clsx(
          'flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-200',
          'hover:bg-zen-surface hover:shadow-sm border border-transparent hover:border-zen-border',
          isDragging ? 'opacity-40 scale-95' : 'opacity-100 scale-100',
          isOver && 'ring-1 ring-zen-accent/20'
        )}
      >
        <div className="relative">
          <img
            src={
              channel.icon ||
              'https://www.gstatic.com/youtube/img/channels/default_profile_picture_default.png'
            }
            alt={channel.name}
            className="w-8 h-8 rounded-full object-cover bg-gray-100 shadow-sm group-hover:scale-105 transition-transform"
            onError={(e) => {
              e.target.src =
                'https://www.gstatic.com/youtube/img/channels/default_profile_picture_default.png'
            }}
          />
          {channel.isLive && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-zen-live border-2 border-zen-surface rounded-full animate-pulse-slow ml-auto"
              title={chrome.i18n.getMessage('badgeLive') || 'LIVE'}
            ></span>
          )}
          {channel.hasNewContent && !channel.isLive && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-blue-500 border-2 border-zen-surface rounded-full"
              title={chrome.i18n.getMessage('badgeNewContent') || 'New Content'}
            ></span>
          )}
        </div>
        <span className="text-sm font-medium text-zen-text truncate flex-1 group-hover:text-zen-text-secondary">
          {channel.name}
        </span>
      </div>

      {isOver && dropPosition === 'after' && (
        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-zen-accent animate-pulse z-20 rounded-full" />
      )}
    </div>
  )
}

export default ChannelItem
