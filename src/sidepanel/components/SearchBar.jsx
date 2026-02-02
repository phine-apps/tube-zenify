import React from 'react'
import { Search } from 'lucide-react'
import { useZen } from '../context/useZen'

const SearchBar = () => {
  const { searchTerm, setSearchTerm } = useZen()

  return (
    <div className="relative mb-4">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-zen-muted" />
      </div>
      <input
        type="text"
        className="block w-full pl-10 pr-4 py-2.5 border border-transparent bg-zen-surface rounded-xl text-sm placeholder-zen-muted text-zen-text shadow-sm focus:outline-none focus:ring-2 focus:ring-zen-accent/50 focus:border-zen-accent/50 focus:bg-zen-surface transition-all duration-200"
        placeholder={
          chrome.i18n.getMessage('searchPlaceholder') || 'Filter channels...'
        }
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  )
}

export default SearchBar
