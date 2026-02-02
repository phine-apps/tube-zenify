import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Storage } from '../src/utils/storage'
import { STORAGE_KEYS } from '../src/utils/constants'

describe('Storage Utils', () => {
  const userId = 'test_user'

  beforeEach(() => {
    vi.clearAllMocks()
    chrome.storage.sync.get.mockResolvedValue({})
    chrome.storage.local.get.mockResolvedValue({})
  })

  it('getFolders returns default structure when empty', async () => {
    const folders = await Storage.getFolders(userId)
    expect(chrome.storage.sync.get).toHaveBeenCalledWith(
      `${userId}_${STORAGE_KEYS.FOLDERS}`
    )
    expect(folders).toEqual({ root: [], uncategorized: [] })
  })

  it('saveFolders saves data to sync storage with sharding', async () => {
    const data = { root: [{ id: '1' }], uncategorized: [] }
    await Storage.saveFolders(userId, data)

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [`${userId}_${STORAGE_KEYS.FOLDERS_META}`]: expect.objectContaining({
          chunks: 1,
          size: expect.any(Number),
        }),
        [`${userId}_${STORAGE_KEYS.FOLDERS_V2}_0`]: JSON.stringify(data),
      })
    )
  })

  it('getChannels returns stored channels', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [`${userId}_${STORAGE_KEYS.CHANNELS}`]: { ch1: { name: 'Test' } },
    })
    const channels = await Storage.getChannels(userId)
    expect(channels).toEqual({ ch1: { name: 'Test' } })
  })

  it('clearUserData removes both storages', async () => {
    await Storage.clearUserData(userId)
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith(
      expect.arrayContaining([
        `${userId}_${STORAGE_KEYS.FOLDERS_META}`,
        `${userId}_${STORAGE_KEYS.FOLDERS}`,
        `${userId}_${STORAGE_KEYS.CHANNELS}`,
      ])
    )
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(
      `${userId}_${STORAGE_KEYS.CHANNELS}`
    )
  })
})
