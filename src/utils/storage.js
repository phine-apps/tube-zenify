import { STORAGE_KEYS, SYNC_LIMIT, MAX_CHUNK_SIZE } from './constants.js'

/**
 * Storage management for TubeZenify
 * Separates folder structure (sync) from channel metadata (local)
 * Scoped by User ID (GAIA ID)
 * Supports data sharding for chrome.storage.sync (8KB per item limit)
 */

const getScopedKey = (userId, key) => `${userId}_${key}`

export const Storage = {
  /**
   * Get folder structure from sync storage
   * Supports both legacy single-key and sharded storage
   * @param {string} userId
   * @returns {Promise<Object>} Folder structure
   */
  async getFolders(userId) {
    if (!userId) throw new Error('User ID required for storage access')

    const metaKey = getScopedKey(userId, STORAGE_KEYS.FOLDERS_META)
    const metaResult = await chrome.storage.sync.get(metaKey)
    const meta = metaResult[metaKey]

    if (meta && typeof meta.chunks === 'number') {
      // Load sharded data
      const chunkKeys = []
      for (let i = 0; i < meta.chunks; i++) {
        chunkKeys.push(getScopedKey(userId, `${STORAGE_KEYS.FOLDERS_V2}_${i}`))
      }

      const chunksResult = await chrome.storage.sync.get(chunkKeys)
      const dataString = chunkKeys.map((k) => chunksResult[k] || '').join('')

      try {
        return JSON.parse(dataString) || { root: [], uncategorized: [] }
      } catch (e) {
        console.error('Failed to parse sharded folders', e)
        return { root: [], uncategorized: [] }
      }
    }

    // Fallback: Legacy single-key storage
    const legacyKey = getScopedKey(userId, STORAGE_KEYS.FOLDERS)
    const legacyResult = await chrome.storage.sync.get(legacyKey)
    return legacyResult[legacyKey] || { root: [], uncategorized: [] }
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
   * Save folder structure to sync storage with sharding
   * @param {string} userId
   * @param {Object} folders Folder structure
   * @returns {Promise<{saved: boolean, size: number, warning: boolean}>}
   */
  async saveFolders(userId, folders) {
    if (!userId) throw new Error('User ID required for storage access')
    const metaKey = getScopedKey(userId, STORAGE_KEYS.FOLDERS_META)

    const dataString = JSON.stringify(folders)
    const size = new Blob([dataString]).size
    const warningThreshold = SYNC_LIMIT * 0.8

    if (size > SYNC_LIMIT) {
      throw new Error(
        `Data size (${(size / 1024).toFixed(1)}KB) exceeds sync storage limit (${SYNC_LIMIT / 1024}KB).`
      )
    }

    // Split into chunks
    const chunks = []
    for (let i = 0; i < dataString.length; i += MAX_CHUNK_SIZE) {
      chunks.push(dataString.substring(i, i + MAX_CHUNK_SIZE))
    }

    // Prepare storage object
    const storageObj = {
      [metaKey]: {
        chunks: chunks.length,
        size,
        updatedAt: Date.now(),
      },
    }

    chunks.forEach((chunk, index) => {
      const key = getScopedKey(userId, `${STORAGE_KEYS.FOLDERS_V2}_${index}`)
      storageObj[key] = chunk
    })

    // Clean up old potential chunks if now smaller
    const metaResult = await chrome.storage.sync.get(metaKey)
    const oldMeta = metaResult[metaKey]
    if (oldMeta && oldMeta.chunks > chunks.length) {
      const keysToRemove = []
      for (let i = chunks.length; i < oldMeta.chunks; i++) {
        keysToRemove.push(
          getScopedKey(userId, `${STORAGE_KEYS.FOLDERS_V2}_${i}`)
        )
      }
      await chrome.storage.sync.remove(keysToRemove)
    }

    await chrome.storage.sync.set(storageObj)

    return {
      saved: true,
      size,
      warning: size > warningThreshold,
    }
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
   * Clear all data for a user
   * @param {string} userId
   */
  async clearUserData(userId) {
    if (!userId) return

    const metaKey = getScopedKey(userId, STORAGE_KEYS.FOLDERS_META)
    const metaResult = await chrome.storage.sync.get(metaKey)
    const meta = metaResult[metaKey]

    const keysToRemove = [
      metaKey,
      getScopedKey(userId, STORAGE_KEYS.FOLDERS),
      getScopedKey(userId, STORAGE_KEYS.CHANNELS),
    ]

    if (meta && meta.chunks) {
      for (let i = 0; i < meta.chunks; i++) {
        keysToRemove.push(
          getScopedKey(userId, `${STORAGE_KEYS.FOLDERS_V2}_${i}`)
        )
      }
    }

    await chrome.storage.sync.remove(keysToRemove)
    await chrome.storage.local.remove(
      getScopedKey(userId, STORAGE_KEYS.CHANNELS)
    )
  },
}
