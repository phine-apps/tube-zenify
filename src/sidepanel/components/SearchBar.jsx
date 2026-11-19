import React from 'react'
import { Search, X } from 'lucide-react'
import clsx from 'clsx'
import { useZen } from '../context/useZen'

const SearchBar = () => {
  const {
    searchTerm,
    setSearchTerm,
    activeTab,
    statusFilter,
    setStatusFilter,
    statusCounts,
  } = useZen()

  const placeholder =
    activeTab === 'playlists'
      ? chrome.i18n.getMessage('searchPlaylistsPlaceholder') ||
        'Filter playlists...'
      : chrome.i18n.getMessage('searchPlaceholder') || 'Filter channels...'

  const toggleFilter = (target) => {
    setStatusFilter((prev) => (prev === target ? 'all' : target))
  }

  return (
    <div className="mb-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-zen-muted" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-8 py-2.5 border border-transparent bg-zen-surface rounded-xl text-sm placeholder-zen-muted text-zen-text shadow-sm focus:outline-none focus:ring-2 focus:ring-zen-accent/50 focus:border-zen-accent/50 focus:bg-zen-surface transition-all duration-200"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-zen-muted hover:text-zen-text transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {activeTab === 'channels' && (
        <div className="flex items-center gap-1.5 px-0.5">
          <button
            type="button"
            onClick={() => toggleFilter('live')}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
              statusFilter === 'live'
                ? 'bg-red-500/15 border-red-500/50 text-red-600 dark:text-red-400 shadow-2xs'
                : 'bg-zen-surface border-zen-border text-zen-muted hover:text-zen-text hover:border-zen-muted/50'
            )}
          >
            <span className="w-2 h-2 rounded-full bg-zen-live animate-pulse-slow" />
            <span>{chrome.i18n.getMessage('filterLive') || 'LIVE'}</span>
            {statusCounts.live > 0 && (
              <span className="opacity-75 text-[10px]">
                ({statusCounts.live})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => toggleFilter('new')}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
              statusFilter === 'new'
                ? 'bg-blue-500/15 border-blue-500/50 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'bg-zen-surface border-zen-border text-zen-muted hover:text-zen-text hover:border-zen-muted/50'
            )}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>{chrome.i18n.getMessage('filterNew') || 'New'}</span>
            {statusCounts.newContent > 0 && (
              <span className="opacity-75 text-[10px]">
                ({statusCounts.newContent})
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export default SearchBar
