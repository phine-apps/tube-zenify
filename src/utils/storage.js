import { STORAGE_KEYS, SYNC_LIMIT, MAX_CHUNK_SIZE } from './constants.js'

/**
 * Storage management for TubeZenify
 * Separates folder structure (sync) from channel/playlist metadata (local)
 * Scoped by User ID (GAIA ID)
 * Supports data sharding for chrome.storage.sync (8KB per item limit)
 */

const getScopedKey = (userId, key) => `${userId}_${key}`
const DEFAULT_STRUCTURE = () => ({ root: [], uncategorized: [] })

async function getShardedFolders(
  userId,
  metaKeyName,
  v2KeyName,
  legacyKeyName
) {
  if (!userId) throw new Error('User ID required for storage access')

  const metaKey = getScopedKey(userId, metaKeyName)
  const metaResult = await chrome.storage.sync.get(metaKey)
  const meta = metaResult[metaKey]

  if (meta && typeof meta.chunks === 'number') {
    const chunkKeys = []
    for (let i = 0; i < meta.chunks; i++) {
      chunkKeys.push(getScopedKey(userId, `${v2KeyName}_${i}`))
    }

    const chunksResult = await chrome.storage.sync.get(chunkKeys)
    const dataString = chunkKeys.map((k) => chunksResult[k] || '').join('')

    try {
      return JSON.parse(dataString) || DEFAULT_STRUCTURE()
    } catch (e) {
      console.error('Failed to parse sharded folders', e)
      return DEFAULT_STRUCTURE()
    }
  }

  if (legacyKeyName) {
    const legacyKey = getScopedKey(userId, legacyKeyName)
    const legacyResult = await chrome.storage.sync.get(legacyKey)
    return legacyResult[legacyKey] || DEFAULT_STRUCTURE()
  }

  return DEFAULT_STRUCTURE()
}

const encoder = new TextEncoder()

/**
 * Splits a string into chunks whose JSON-serialized UTF-8 byte length stays
 * safely below Chrome's 8,192-byte QUOTA_BYTES_PER_ITEM limit without splitting
 * UTF-16 surrogate pairs.
 */
function splitStringByByteLimit(str, maxBytes = MAX_CHUNK_SIZE) {
  if (!str) return ['']
  const chunks = []
  let start = 0
  let currentBytes = 0

  for (let i = 0; i < str.length;) {
    const codePoint = str.codePointAt(i)
    const charLen = codePoint > 0xffff ? 2 : 1
    const ch = str.slice(i, i + charLen)
    // Account for JSON.stringify escaping (quotes/backslashes/control chars)
    const serialized = JSON.stringify(ch)
    const charBytes = encoder.encode(serialized).length - 2

    if (currentBytes + charBytes > maxBytes && i > start) {
      chunks.push(str.slice(start, i))
      start = i
      currentBytes = 0
    }

    currentBytes += charBytes
    i += charLen
  }

  if (start < str.length) {
    chunks.push(str.slice(start))
  }

  return chunks
}

async function saveShardedFolders(userId, folders, metaKeyName, v2KeyName) {
  if (!userId) throw new Error('User ID required for storage access')
  const metaKey = getScopedKey(userId, metaKeyName)

  const dataString = JSON.stringify(folders)
  const size = new Blob([dataString]).size
  const warningThreshold = SYNC_LIMIT * 0.8

  if (size > SYNC_LIMIT) {
    throw new Error(
      `Data size (${(size / 1024).toFixed(1)}KB) exceeds sync storage limit (${SYNC_LIMIT / 1024}KB).`
    )
  }

  // Reserve room for key name + JSON quotes so each item stays well under 8192 bytes
  const maxChunkBytes = Math.min(MAX_CHUNK_SIZE, 6500)
  const chunks = splitStringByByteLimit(dataString, maxChunkBytes)

  const storageObj = {
    [metaKey]: {
      chunks: chunks.length,
      size,
      updatedAt: Date.now(),
    },
  }

  chunks.forEach((chunk, index) => {
    const key = getScopedKey(userId, `${v2KeyName}_${index}`)
    storageObj[key] = chunk
  })

  const metaResult = await chrome.storage.sync.get(metaKey)
  const oldMeta = metaResult[metaKey]

  // Write new chunks + metadata FIRST so a quota/network error never deletes old data
  await chrome.storage.sync.set(storageObj)

  if (oldMeta && oldMeta.chunks > chunks.length) {
    const keysToRemove = []
    for (let i = chunks.length; i < oldMeta.chunks; i++) {
      keysToRemove.push(getScopedKey(userId, `${v2KeyName}_${i}`))
    }
    await chrome.storage.sync.remove(keysToRemove)
  }

  return {
    saved: true,
    size,
    warning: size > warningThreshold,
  }
}

async function collectSyncKeysToRemove(
  userId,
  metaKeyName,
  v2KeyName,
  legacyKeyName
) {
  const metaKey = getScopedKey(userId, metaKeyName)
  const metaResult = await chrome.storage.sync.get(metaKey)
  const meta = metaResult[metaKey]

  const keys = [metaKey]
  if (legacyKeyName) {
    keys.push(getScopedKey(userId, legacyKeyName))
  }
  if (meta && meta.chunks) {
    for (let i = 0; i < meta.chunks; i++) {
      keys.push(getScopedKey(userId, `${v2KeyName}_${i}`))
    }
  }
  return keys
}

export const Storage = {
  /**
   * Get channel folder structure from sync storage
   * Supports both legacy single-key and sharded storage
   * @param {string} userId
   * @returns {Promise<Object>} Folder structure
   */
  getFolders(userId) {
    return getShardedFolders(
      userId,
      STORAGE_KEYS.FOLDERS_META,
      STORAGE_KEYS.FOLDERS_V2,
      STORAGE_KEYS.FOLDERS
    )
  },

  /**
   * Get playlist folder structure from sync storage
   * @param {string} userId
   * @returns {Promise<Object>} Playlist folder structure
   */
  getPlaylistFolders(userId) {
    return getShardedFolders(
      userId,
      STORAGE_KEYS.PLAYLIST_FOLDERS_META,
      STORAGE_KEYS.PLAYLIST_FOLDERS_V2,
      STORAGE_KEYS.PLAYLIST_FOLDERS
    )
  },

  /**
   * Calculate approximate size of data in bytes
   * @param {any} data
   * @returns {number} Size in bytes
   */
  calculateSize(data) {
    return new Blob([JSON.stringify(data)]).size
  },

  /**
   * Save channel folder structure to sync storage with sharding
   * @param {string} userId
   * @param {Object} folders Folder structure
   * @returns {Promise<{saved: boolean, size: number, warning: boolean}>}
   */
  saveFolders(userId, folders) {
    return saveShardedFolders(
      userId,
      folders,
      STORAGE_KEYS.FOLDERS_META,
      STORAGE_KEYS.FOLDERS_V2
    )
  },

  /**
   * Save playlist folder structure to sync storage with sharding
   * @param {string} userId
   * @param {Object} folders Playlist folder structure
   * @returns {Promise<{saved: boolean, size: number, warning: boolean}>}
   */
  savePlaylistFolders(userId, folders) {
    return saveShardedFolders(
      userId,
      folders,
      STORAGE_KEYS.PLAYLIST_FOLDERS_META,
      STORAGE_KEYS.PLAYLIST_FOLDERS_V2
    )
  },

  /**
   * Get channel metadata from local storage
   * @param {string} userId
   * @returns {Promise<Object>} Channel metadata map
   */
  async getChannels(userId) {
    if (!userId) throw new Error('User ID required for storage access')
    const key = getScopedKey(userId, STORAGE_KEYS.CHANNELS)
    const result = await chrome.storage.local.get(key)
    return result[key] || {}
  },

  /**
   * Save channel metadata to local storage
   * @param {string} userId
   * @param {Object} channels Channel metadata map
   */
  async saveChannels(userId, channels) {
    if (!userId) throw new Error('User ID required for storage access')
    const key = getScopedKey(userId, STORAGE_KEYS.CHANNELS)
    await chrome.storage.local.set({ [key]: channels })
  },

  /**
   * Get playlist metadata from local storage
   * @param {string} userId
   * @returns {Promise<Object>} Playlist metadata map
   */
  async getPlaylists(userId) {
    if (!userId) throw new Error('User ID required for storage access')
    const key = getScopedKey(userId, STORAGE_KEYS.PLAYLISTS)
    const result = await chrome.storage.local.get(key)
    return result[key] || {}
  },

  /**
   * Save playlist metadata to local storage
   * @param {string} userId
   * @param {Object} playlists Playlist metadata map
   */
  async savePlaylists(userId, playlists) {
    if (!userId) throw new Error('User ID required for storage access')
    const key = getScopedKey(userId, STORAGE_KEYS.PLAYLISTS)
    await chrome.storage.local.set({ [key]: playlists })
  },

  /**
   * Clear all data for a user
   * @param {string} userId
   */
  async clearUserData(userId) {
    if (!userId) return

    const [channelSyncKeys, playlistSyncKeys] = await Promise.all([
      collectSyncKeysToRemove(
        userId,
        STORAGE_KEYS.FOLDERS_META,
        STORAGE_KEYS.FOLDERS_V2,
        STORAGE_KEYS.FOLDERS
      ),
      collectSyncKeysToRemove(
        userId,
        STORAGE_KEYS.PLAYLIST_FOLDERS_META,
        STORAGE_KEYS.PLAYLIST_FOLDERS_V2,
        STORAGE_KEYS.PLAYLIST_FOLDERS
      ),
    ])

    const keysToRemove = [
      ...channelSyncKeys,
      ...playlistSyncKeys,
      getScopedKey(userId, STORAGE_KEYS.CHANNELS),
    ]

    await chrome.storage.sync.remove(keysToRemove)
    await chrome.storage.local.remove([
      getScopedKey(userId, STORAGE_KEYS.CHANNELS),
      getScopedKey(userId, STORAGE_KEYS.PLAYLISTS),
    ])
  },
}
