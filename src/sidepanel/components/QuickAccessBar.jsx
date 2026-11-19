import React from 'react'
import { Clock, ThumbsUp, History, ListVideo } from 'lucide-react'
import { openYouTubeUrl } from '../../utils/navigation'

const QUICK_LINKS = [
  {
    id: 'WL',
    labelKey: 'quickWatchLater',
    fallbackLabel: 'Watch Later',
    url: 'https://www.youtube.com/playlist?list=WL',
    icon: Clock,
  },
  {
    id: 'LL',
    labelKey: 'quickLikedVideos',
    fallbackLabel: 'Liked Videos',
    url: 'https://www.youtube.com/playlist?list=LL',
    icon: ThumbsUp,
  },
  {
    id: 'HISTORY',
    labelKey: 'quickHistory',
    fallbackLabel: 'History',
    url: 'https://www.youtube.com/feed/history',
    icon: History,
  },
  {
    id: 'ALL_PLAYLISTS',
    labelKey: 'quickAllPlaylists',
    fallbackLabel: 'All Playlists',
    url: 'https://www.youtube.com/feed/playlists',
    icon: ListVideo,
  },
]

const QuickAccessBar = () => {
  return (
    <div
      className="mb-3 pb-3 border-b border-zen-border"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-1 mb-1.5 text-[10px] font-bold text-zen-muted uppercase tracking-wider">
        {chrome.i18n.getMessage('quickAccessTitle') || 'Quick Access'}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {QUICK_LINKS.map((item) => {
          const Icon = item.icon
          const label =
            chrome.i18n.getMessage(item.labelKey) || item.fallbackLabel
          return (
            <button
              key={item.id}
              type="button"
              onClick={(e) => openYouTubeUrl(item.url, e)}
              onAuxClick={(e) => {
                if (e.button === 1) openYouTubeUrl(item.url, e)
              }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-zen-surface border border-zen-border/80 text-xs font-medium text-zen-text hover:text-zen-accent hover:border-zen-accent/40 hover:bg-zen-accent/5 transition-all text-left truncate shadow-2xs"
              title={label}
            >
              <Icon size={14} className="text-zen-accent shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default QuickAccessBar
