import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Storage } from '../../utils/storage'
import { SYNC_LIMIT } from '../../utils/constants'
import { ZenContext } from './zenContextValue'
import {
  useFolderStructure,
  validateFolderStructure,
} from '../hooks/useFolderStructure'
import { filterAndSortTree, flattenFolders } from '../utils/treeFilter'

const EMPTY_STRUCTURE = () => ({ root: [], uncategorized: [] })

const getFallbackUserId = () => {
  const storedId = localStorage.getItem('tubezenify_local_user_id')
  if (storedId) {
    return storedId
  }
  const newId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  localStorage.setItem('tubezenify_local_user_id', newId)
  return newId
}

const getInitialActiveTab = () => {
  const saved = localStorage.getItem('tubezenify_active_tab')
  return saved === 'playlists' ? 'playlists' : 'channels'
}

const getInitialSortBy = () => {
  const saved = localStorage.getItem('tubezenify_sort_by')
  return saved === 'name' || saved === 'status' ? saved : 'manual'
}

const getInitialOpenChannelTab = () => {
  const saved = localStorage.getItem('tubezenify_open_channel_tab')
  return saved === 'videos' ? 'videos' : 'home'
}

export const ZenProvider = ({ children }) => {
  const [activeTab, setActiveTabState] = useState(getInitialActiveTab)
  const [sortBy, setSortByState] = useState(getInitialSortBy)
  const [openChannelTab, setOpenChannelTabState] = useState(
    getInitialOpenChannelTab
  )
  const [statusFilter, setStatusFilter] = useState('all')

  const [channels, setChannels] = useState({})
  const [playlists, setPlaylists] = useState({})
  const [channelStructure, setChannelStructure] = useState(EMPTY_STRUCTURE)
  const [playlistStructure, setPlaylistStructure] = useState(EMPTY_STRUCTURE)

  const [userId, setUserId] = useState(null)
  const [loadedUserId, setLoadedUserId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(
    () => chrome.i18n.getMessage('statusOpeningYouTube') || ''
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [storageWarning, setStorageWarning] = useState(null)
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [isConnecting, setIsConnecting] = useState(true)
  const [isMigrating, setIsMigrating] = useState(false)
  const [isLoginRequired, setIsLoginRequired] = useState(false)

  const isLoaded = Boolean(userId && loadedUserId === userId)
  const userIdRef = useRef(userId)
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const isCloudSyncActive = useMemo(() => {
    return userId && !userId.startsWith('local_')
  }, [userId])

  const setActiveTab = useCallback((tab) => {
    const next = tab === 'playlists' ? 'playlists' : 'channels'
    setActiveTabState(next)
    setSelectedFolderId(null)
    if (next === 'playlists') {
      setStatusFilter('all')
    }
    localStorage.setItem('tubezenify_active_tab', next)
  }, [])

  const setSortBy = useCallback((nextSort) => {
    const valid =
      nextSort === 'name' || nextSort === 'status' ? nextSort : 'manual'
    setSortByState(valid)
    localStorage.setItem('tubezenify_sort_by', valid)
  }, [])

  const setOpenChannelTab = useCallback((mode) => {
    const next = mode === 'videos' ? 'videos' : 'home'
    setOpenChannelTabState(next)
    localStorage.setItem('tubezenify_open_channel_tab', next)
  }, [])

  const channelActions = useFolderStructure(
    channels,
    setChannelStructure,
    channelStructure,
    activeTab === 'channels' ? selectedFolderId : null,
    'channel'
  )

  const playlistActions = useFolderStructure(
    playlists,
    setPlaylistStructure,
    playlistStructure,
    activeTab === 'playlists' ? selectedFolderId : null,
    'playlist'
  )

  const activeStructure =
    activeTab === 'channels' ? channelStructure : playlistStructure
  const activeActions =
    activeTab === 'channels' ? channelActions : playlistActions
  const activeItems = activeTab === 'channels' ? channels : playlists

  // Initialize user ID on mount with retry logic
  useEffect(() => {
    let cancelled = false
    let retryTimer = null
    let retryCount = 0
    const maxRetries = 5

    const initializeUserId = async () => {
      if (cancelled) return
      try {
        const tabs = await chrome.tabs.query({
          url: '*://*.youtube.com/*',
        })
        if (cancelled) return

        if (tabs.length > 0) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: 'GET_GAIA_ID' },
            (response) => {
              if (cancelled) return
              if (chrome.runtime.lastError || !response || !response.gaiaId) {
                if (retryCount < maxRetries) {
                  retryCount++
                  retryTimer = setTimeout(initializeUserId, 1500)
                  return
                }
                setUserId(getFallbackUserId())
                return
              }

              setUserId(response.gaiaId)
            }
          )
        } else {
          setUserId(getFallbackUserId())
        }
      } catch (e) {
        if (cancelled) return
        console.error('Failed to initialize user ID', e)
        setUserId(getFallbackUserId())
      }
    }
    initializeUserId()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  // Sequentially migrate (if needed) and load folder structures + cached metadata
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const migrateAndLoad = async () => {
      try {
        // 1. Migrate from local fallback to GAIA account before loading
        if (!userId.startsWith('local_')) {
          const localId = localStorage.getItem('tubezenify_local_user_id')
          if (localId && localId !== 'null') {
            const [
              localData,
              localChannels,
              localPlaylistData,
              localPlaylists,
              existingGaiaData,
              existingGaiaPlaylists,
            ] = await Promise.all([
              Storage.getFolders(localId),
              Storage.getChannels(localId),
              Storage.getPlaylistFolders(localId),
              Storage.getPlaylists(localId),
              Storage.getFolders(userId),
              Storage.getPlaylistFolders(userId),
            ])
            if (cancelled) return

            const hasLocalChannels =
              localData &&
              (localData.root?.length > 0 ||
                localData.uncategorized?.length > 0)
            const hasGaiaChannels =
              existingGaiaData &&
              (existingGaiaData.root?.length > 0 ||
                existingGaiaData.uncategorized?.length > 0)

            const hasLocalPlaylists =
              localPlaylistData &&
              (localPlaylistData.root?.length > 0 ||
                localPlaylistData.uncategorized?.length > 0)
            const hasGaiaPlaylists =
              existingGaiaPlaylists &&
              (existingGaiaPlaylists.root?.length > 0 ||
                existingGaiaPlaylists.uncategorized?.length > 0)

            const shouldMigrateChannels = hasLocalChannels && !hasGaiaChannels
            const shouldMigratePlaylists =
              hasLocalPlaylists && !hasGaiaPlaylists

            if (shouldMigrateChannels || shouldMigratePlaylists) {
              setIsMigrating(true)
              if (shouldMigrateChannels) {
                await Storage.saveFolders(userId, localData)
                await Storage.saveChannels(userId, localChannels)
              }
              if (shouldMigratePlaylists) {
                await Storage.savePlaylistFolders(userId, localPlaylistData)
                await Storage.savePlaylists(userId, localPlaylists)
              }
              if (!cancelled) setIsMigrating(false)
            }
          }
        }

        if (cancelled) return

        // 2. Load folder structures and cached metadata
        const [
          savedChannelsStruct,
          savedPlaylistsStruct,
          cachedChannels,
          cachedPlaylists,
        ] = await Promise.all([
          Storage.getFolders(userId),
          Storage.getPlaylistFolders(userId),
          Storage.getChannels(userId),
          Storage.getPlaylists(userId),
        ])
        if (cancelled) return

        setChannelStructure(savedChannelsStruct || EMPTY_STRUCTURE())
        setPlaylistStructure(savedPlaylistsStruct || EMPTY_STRUCTURE())

        if (cachedChannels && Object.keys(cachedChannels).length > 0) {
          setChannels((prev) =>
            Object.keys(prev).length > 0 ? prev : cachedChannels
          )
        }
        if (cachedPlaylists && Object.keys(cachedPlaylists).length > 0) {
          setPlaylists((prev) =>
            Object.keys(prev).length > 0 ? prev : cachedPlaylists
          )
        }
        setLoadedUserId(userId)
      } catch (e) {
        if (cancelled) return
        console.error('Failed to migrate/load folders', e)
        setIsMigrating(false)
        setErrorMsg(chrome.i18n.getMessage('errorLoadFolders'))
        setLoadedUserId(userId)
      }
    }

    migrateAndLoad()

    return () => {
      cancelled = true
    }
  }, [userId])

  const updateStorageWarningFromSizes = useCallback((chSize, plSize) => {
    const totalSize = chSize + plSize
    if (totalSize > SYNC_LIMIT * 0.8) {
      setStorageWarning({
        error: false,
        percentage: Math.round((totalSize / SYNC_LIMIT) * 100),
        size: totalSize,
        limit: SYNC_LIMIT,
      })
    } else {
      setStorageWarning(null)
    }
  }, [])

  const lastSizesRef = useRef({ ch: 0, pl: 0 })

  // Auto-save channel folder structure
  useEffect(() => {
    if (!isLoaded || !userId || isMigrating) return

    const save = async () => {
      try {
        const result = await Storage.saveFolders(userId, channelStructure)
        lastSizesRef.current.ch = result.size
        updateStorageWarningFromSizes(
          lastSizesRef.current.ch,
          lastSizesRef.current.pl
        )
      } catch (e) {
        console.error('Failed to save folders', e)
        setStorageWarning({
          error: true,
          message: e.message,
        })
      }
    }

    const timer = setTimeout(save, 500)
    return () => clearTimeout(timer)
  }, [
    channelStructure,
    userId,
    isLoaded,
    isMigrating,
    updateStorageWarningFromSizes,
  ])

  // Auto-save playlist folder structure
  useEffect(() => {
    if (!isLoaded || !userId || isMigrating) return

    const save = async () => {
      try {
        const result = await Storage.savePlaylistFolders(
          userId,
          playlistStructure
        )
        lastSizesRef.current.pl = result.size
        updateStorageWarningFromSizes(
          lastSizesRef.current.ch,
          lastSizesRef.current.pl
        )
      } catch (e) {
        console.error('Failed to save playlist folders', e)
        setStorageWarning({
          error: true,
          message: e.message,
        })
      }
    }

    const timer = setTimeout(save, 500)
    return () => clearTimeout(timer)
  }, [
    playlistStructure,
    userId,
    isLoaded,
    isMigrating,
    updateStorageWarningFromSizes,
  ])

  // Auto-save channels metadata (local storage)
  useEffect(() => {
    if (!userId || Object.keys(channels).length === 0) return
    Storage.saveChannels(userId, channels).catch((e) =>
      console.error('Failed to save channels', e)
    )
  }, [channels, userId])

  // Auto-save playlists metadata (local storage)
  useEffect(() => {
    if (!userId || Object.keys(playlists).length === 0) return
    Storage.savePlaylists(userId, playlists).catch((e) =>
      console.error('Failed to save playlists', e)
    )
  }, [playlists, userId])

  // Communication with content script / background
  useEffect(() => {
    const handleMessage = (request, _sender, _sendResponse) => {
      const maybeSwitchUserId = (gaiaId) => {
        if (!gaiaId) return false
        const prev = userIdRef.current
        if (!prev || prev !== gaiaId) {
          setUserId(gaiaId)
          return Boolean(prev && !prev.startsWith('local_') && prev !== gaiaId)
        }
        return false
      }

      if (request.action === 'CHANNELS_UPDATED') {
        const discovered = request.channels || {}
        const accountSwitched = maybeSwitchUserId(request.gaiaId)
        setChannels((prev) => {
          if (accountSwitched || Object.keys(prev).length === 0) {
            return discovered
          }
          // Protect against partial DOM scrape overwriting a full feed fetch
          const prevCount = Object.keys(prev).length
          const nextCount = Object.keys(discovered).length
          if (nextCount < prevCount * 0.5) {
            return { ...prev, ...discovered }
          }
          return discovered
        })
        setIsConnecting(false)
        setErrorMsg('')
        setIsLoginRequired(false)
      } else if (request.action === 'PLAYLISTS_UPDATED') {
        const discovered = request.playlists || {}
        const accountSwitched = maybeSwitchUserId(request.gaiaId)
        setPlaylists((prev) => {
          if (accountSwitched || Object.keys(prev).length === 0) {
            return discovered
          }
          const prevCount = Object.keys(prev).length
          const nextCount = Object.keys(discovered).length
          if (nextCount < prevCount * 0.5) {
            return { ...prev, ...discovered }
          }
          return discovered
        })
      } else if (request.action === 'CONNECTION_ERROR') {
        setErrorMsg(
          request.error || chrome.i18n.getMessage('statusConnectionFailed')
        )
        setIsConnecting(false)
        if (request.isLoginRequired) {
          setIsLoginRequired(true)
        }
      } else if (request.action === 'SET_CONNECTING') {
        setIsConnecting(true)
        setErrorMsg(chrome.i18n.getMessage('statusOpeningYouTube'))
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const retryConnection = useCallback(() => {
    setIsConnecting(true)
    setErrorMsg(chrome.i18n.getMessage('statusOpeningYouTube'))
    chrome.runtime.sendMessage({ action: 'START_SCRAPE' })
  }, [])

  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'START_SCRAPE' })
  }, [])

  const openYouTube = useCallback(() => {
    chrome.tabs.create({ url: 'https://www.youtube.com/feed/subscriptions' })
  }, [])

  const reloadWithClear = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'CLEAR_AND_SCRAPE' })
  }, [])

  const exportSettings = useCallback(() => {
    const payload = {
      version: 2,
      channels: channelStructure,
      playlists: playlistStructure,
    }
    const data = JSON.stringify(payload, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tubezenify_folders_${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [channelStructure, playlistStructure])

  const importSettings = useCallback((jsonString) => {
    try {
      if (jsonString.length > 10 * 1024 * 1024) {
        throw new Error('Import file is too large (max 10MB)')
      }

      const parsed = JSON.parse(jsonString)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid structure: must be an object')
      }

      // v2 format: { channels, playlists }
      if (parsed.channels !== undefined || parsed.playlists !== undefined) {
        let totalSize = 0
        if (parsed.channels) {
          validateFolderStructure(parsed.channels)
          totalSize += Storage.calculateSize(parsed.channels)
        }
        if (parsed.playlists) {
          validateFolderStructure(parsed.playlists)
          totalSize += Storage.calculateSize(parsed.playlists)
        }
        if (totalSize > SYNC_LIMIT) {
          throw new Error(
            `Combined import data size (${(totalSize / 1024).toFixed(1)}KB) exceeds sync storage limit (${SYNC_LIMIT / 1024}KB).`
          )
        }

        if (
          confirm(
            chrome.i18n.getMessage('confirmImportSwaps') ||
              'Importing will overwrite your current folder structure. Continue?'
          )
        ) {
          if (parsed.channels) {
            setChannelStructure({
              root: parsed.channels.root,
              uncategorized: parsed.channels.uncategorized || [],
            })
          }
          if (parsed.playlists) {
            setPlaylistStructure({
              root: parsed.playlists.root,
              uncategorized: parsed.playlists.uncategorized || [],
            })
          }
          alert(chrome.i18n.getMessage('importSuccess') || 'Import successful!')
        }
        return
      }

      // Legacy v1 format: { root, uncategorized } (channels only)
      validateFolderStructure(parsed)
      if (
        confirm(
          chrome.i18n.getMessage('confirmImportSwaps') ||
            'Importing will overwrite your current folder structure. Continue?'
        )
      ) {
        setChannelStructure({
          root: parsed.root,
          uncategorized: parsed.uncategorized || [],
        })
        alert(chrome.i18n.getMessage('importSuccess') || 'Import successful!')
      }
    } catch (e) {
      console.error('Import failed', e)
      alert(
        (chrome.i18n.getMessage('importFailed') || 'Import failed: ') +
          e.message
      )
    }
  }, [])

  const filteredStructure = useMemo(
    () =>
      filterAndSortTree(activeStructure, activeItems, {
        searchTerm,
        statusFilter,
        sortBy,
        activeTab,
      }),
    [activeStructure, activeItems, searchTerm, statusFilter, sortBy, activeTab]
  )

  const availableFolders = useMemo(
    () => flattenFolders(activeStructure.root),
    [activeStructure.root]
  )

  const statusCounts = useMemo(() => {
    let live = 0
    let newContent = 0
    Object.values(channels).forEach((ch) => {
      if (ch?.isLive) live++
      if (ch?.hasNewContent) newContent++
    })
    return { live, newContent }
  }, [channels])

  return (
    <ZenContext.Provider
      value={{
        activeTab,
        setActiveTab,
        channels,
        playlists,
        items: activeItems,
        folderStructure: filteredStructure,
        availableFolders,
        moveItem: activeActions.moveItem,
        moveItemsBatch: activeActions.moveItemsBatch,
        createFolder: activeActions.createFolder,
        renameFolder: (id, name) =>
          activeActions.renameFolder(id, activeStructure, name),
        updateFolderAppearance: activeActions.updateFolderAppearance,
        deleteFolder: activeActions.deleteFolder,
        toggleAllFolders: activeActions.toggleAllFolders,
        toggleFolder: activeActions.toggleFolder,
        exportSettings,
        importSettings,
        searchTerm,
        setSearchTerm,
        statusFilter,
        setStatusFilter,
        statusCounts,
        sortBy,
        setSortBy,
        openChannelTab,
        setOpenChannelTab,
        errorMsg,
        storageWarning,
        setStorageWarning,
        selectedFolderId,
        selectFolder: setSelectedFolderId,
        isConnecting,
        isLoaded,
        isMigrating,
        isLoginRequired,
        retryConnection,
        openYouTube,
        reloadWithClear,
        isCloudSyncActive,
      }}
    >
      {children}
    </ZenContext.Provider>
  )
}
