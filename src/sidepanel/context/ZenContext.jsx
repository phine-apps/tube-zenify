import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Storage } from '../../utils/storage'
import { SYNC_LIMIT } from '../../utils/constants'
import { ZenContext } from './zenContextValue'
import { useFolderStructure } from '../hooks/useFolderStructure'

// Helper to generate a temporary local ID
const getFallbackUserId = () => {
  const storedId = localStorage.getItem('tubezenify_local_user_id')
  if (storedId) {
    return storedId
  }
  const newId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  localStorage.setItem('tubezenify_local_user_id', newId)
  return newId
}

export const ZenProvider = ({ children }) => {
  const [channels, setChannels] = useState({})
  const [folderStructure, setFolderStructure] = useState({
    root: [],
    uncategorized: [],
  })
  const [userId, setUserId] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [storageWarning, setStorageWarning] = useState(null)
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isMigrating, setIsMigrating] = useState(false)
  const [isLoginRequired, setIsLoginRequired] = useState(false)

  const isCloudSyncActive = useMemo(() => {
    return userId && !userId.startsWith('local_')
  }, [userId])

  const {
    createFolder,
    moveItem,
    deleteFolder,
    renameFolder,
    exportSettings,
    importSettings,
    toggleAllFolders,
    toggleFolder,
  } = useFolderStructure(
    channels,
    setFolderStructure,
    folderStructure,
    selectedFolderId
  )

  // Initialize user ID on mount with retry logic
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 5

    const initializeUserId = async () => {
      try {
        const tabs = await chrome.tabs.query({
          url: '*://*.youtube.com/*',
        })

        if (tabs.length > 0) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: 'GET_GAIA_ID' },
            async (response) => {
              if (chrome.runtime.lastError || !response || !response.gaiaId) {
                if (retryCount < maxRetries) {
                  retryCount++
                  setTimeout(initializeUserId, 1500)
                  return
                }
                setUserId(getFallbackUserId())
                return
              }

              const newGaiaId = response.gaiaId
              setUserId((prev) => {
                if (prev !== newGaiaId) setIsLoaded(false)
                return newGaiaId
              })
            }
          )
        } else {
          setUserId((prev) => {
            const next = getFallbackUserId()
            if (prev !== next) setIsLoaded(false)
            return next
          })
        }
      } catch (e) {
        console.error('Failed to initialize user ID', e)
        setUserId((prev) => {
          const next = getFallbackUserId()
          if (prev !== next) setIsLoaded(false)
          return next
        })
      }
    }
    initializeUserId()
  }, [])

  // Handle migration from local to GAIA
  useEffect(() => {
    if (!userId || userId.startsWith('local_')) return

    const migrate = async () => {
      const localId = localStorage.getItem('tubezenify_local_user_id')
      if (!localId || localId === 'null') return

      try {
        const localData = await Storage.getFolders(localId)
        const localChannels = await Storage.getChannels(localId)

        if (
          localData &&
          (localData.root?.length > 0 || localData.uncategorized?.length > 0)
        ) {
          // Check if GAIA already has data
          const existingGaiaData = await Storage.getFolders(userId)
          if (
            !existingGaiaData ||
            ((!existingGaiaData.root || existingGaiaData.root.length === 0) &&
              (!existingGaiaData.uncategorized ||
                existingGaiaData.uncategorized.length === 0))
          ) {
            setIsMigrating(true)
            await Storage.saveFolders(userId, localData)
            await Storage.saveChannels(userId, localChannels)
            setIsMigrating(false)
            // Force a reload of the new GAIA data
            setIsLoaded(false)
          }
        }
      } catch (e) {
        console.error('Migration check failed', e)
        setIsMigrating(false)
      }
    }
    migrate()
  }, [userId])

  // Load from storage
  useEffect(() => {
    if (!userId || isLoaded) return
    const init = async () => {
      try {
        const saved = await Storage.getFolders(userId)
        if (saved) {
          setFolderStructure(saved)
        }
        setIsLoaded(true)
      } catch (e) {
        console.error('Failed to load folders', e)
        setErrorMsg(chrome.i18n.getMessage('errorLoadFolders'))
        setIsLoaded(true)
      }
    }
    init()
  }, [userId, isLoaded])

  // Auto-save folder structure
  useEffect(() => {
    if (!isLoaded || !userId) return

    const save = async () => {
      try {
        const result = await Storage.saveFolders(userId, folderStructure)
        if (result.warning) {
          setStorageWarning({
            error: false,
            percentage: Math.round((result.size / SYNC_LIMIT) * 100),
            size: result.size,
            limit: SYNC_LIMIT,
          })
        } else {
          setStorageWarning(null)
        }
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
  }, [folderStructure, userId, isLoaded])

  // Auto-save channels metadata (local storage)
  useEffect(() => {
    if (!userId || Object.keys(channels).length === 0) return
    Storage.saveChannels(userId, channels).catch((e) =>
      console.error('Failed to save channels', e)
    )
  }, [channels, userId])

  // Communication with content script
  useEffect(() => {
    const handleMessage = (request, _sender, _sendResponse) => {
      if (request.action === 'CHANNELS_UPDATED') {
        const discovered = request.channels || {}
        setChannels(discovered)
        setIsConnecting(false)
        setErrorMsg('')
        setIsLoginRequired(false)

        // Upgrade userId from local to GAIA if available
        if (request.gaiaId) {
          setUserId((prev) => {
            if (!prev || prev.startsWith('local_')) {
              if (prev !== request.gaiaId) setIsLoaded(false)
              return request.gaiaId
            }
            return prev
          })
        }
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

  // Try to connect to YouTube on mount
  const retryConnection = useCallback(() => {
    setIsConnecting(true)
    setErrorMsg(chrome.i18n.getMessage('statusOpeningYouTube'))
    chrome.runtime.sendMessage({ action: 'START_SCRAPE' })
  }, [])

  useEffect(() => {
    retryConnection()
  }, [retryConnection])

  const openYouTube = useCallback(() => {
    chrome.tabs.create({ url: 'https://www.youtube.com/feed/subscriptions' })
  }, [])

  const reloadWithClear = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'CLEAR_AND_SCRAPE' })
  }, [])

  const filteredStructure = useMemo(() => {
    if (!searchTerm) return folderStructure

    const term = searchTerm.toLowerCase()
    const filterChannels = (list) =>
      list.filter((item) => {
        const channel = channels[item.id]
        return channel && channel.name.toLowerCase().includes(term)
      })

    const filterFolders = (folders) => {
      return folders
        .map((folder) => {
          if (folder.type === 'folder') {
            const matches = filterChannels(folder.children || [])
            if (
              matches.length > 0 ||
              folder.name.toLowerCase().includes(term)
            ) {
              return { ...folder, children: matches, expanded: true }
            }
            return null
          }
          return null
        })
        .filter(Boolean)
    }

    return {
      root: filterFolders(folderStructure.root),
      uncategorized: filterChannels(folderStructure.uncategorized),
    }
  }, [folderStructure, searchTerm, channels])

  return (
    <ZenContext.Provider
      value={{
        channels,
        folderStructure: filteredStructure,
        moveItem,
        createFolder,
        renameFolder: (id, name) => renameFolder(id, folderStructure, name),
        deleteFolder,
        toggleAllFolders,
        toggleFolder,
        exportSettings: () => exportSettings(folderStructure),
        importSettings,
        searchTerm,
        setSearchTerm,
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
