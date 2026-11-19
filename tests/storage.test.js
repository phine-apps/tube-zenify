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
        `${userId}_${STORAGE_KEYS.PLAYLIST_FOLDERS_META}`,
        `${userId}_${STORAGE_KEYS.PLAYLIST_FOLDERS}`,
        `${userId}_${STORAGE_KEYS.CHANNELS}`,
      ])
    )
    expect(chrome.storage.local.remove).toHaveBeenCalledWith([
      `${userId}_${STORAGE_KEYS.CHANNELS}`,
      `${userId}_${STORAGE_KEYS.PLAYLISTS}`,
    ])
  })

  it('getPlaylistFolders and savePlaylistFolders use playlist sync keys', async () => {
    const empty = await Storage.getPlaylistFolders(userId)
    expect(empty).toEqual({ root: [], uncategorized: [] })

    const data = {
      root: [{ id: 'f1', type: 'folder', name: 'Music', children: ['PL1'] }],
      uncategorized: [],
    }
    await Storage.savePlaylistFolders(userId, data)

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [`${userId}_${STORAGE_KEYS.PLAYLIST_FOLDERS_META}`]:
          expect.objectContaining({
            chunks: 1,
            size: expect.any(Number),
          }),
        [`${userId}_${STORAGE_KEYS.PLAYLIST_FOLDERS_V2}_0`]:
          JSON.stringify(data),
      })
    )
  })

  it('getPlaylists and savePlaylists use playlist local key', async () => {
    const playlists = { PL1: { id: 'PL1', name: 'My Playlist' } }
    await Storage.savePlaylists(userId, playlists)
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [`${userId}_${STORAGE_KEYS.PLAYLISTS}`]: playlists,
    })

    chrome.storage.local.get.mockResolvedValue({
      [`${userId}_${STORAGE_KEYS.PLAYLISTS}`]: playlists,
    })
    const loaded = await Storage.getPlaylists(userId)
    expect(loaded).toEqual(playlists)
  })

  it('shards multibyte UTF-8 folder names safely under 8192 bytes per item', async () => {
    const folders = {
      root: Array.from({ length: 120 }, (_, i) => ({
        id: `f_${i}`,
        type: 'folder',
        name: `日本語フォルダ名_${i}_🎵🎮`,
        children: [`UC_${i}`],
      })),
      uncategorized: [],
    }

    await Storage.saveFolders(userId, folders)
    const savedPayload = chrome.storage.sync.set.mock.calls[0][0]
    const meta = savedPayload[`${userId}_${STORAGE_KEYS.FOLDERS_META}`]
    expect(meta.chunks).toBeGreaterThan(1)

    const encoder = new TextEncoder()
    let reconstructed = ''
    for (let i = 0; i < meta.chunks; i++) {
      const key = `${userId}_${STORAGE_KEYS.FOLDERS_V2}_${i}`
      const chunk = savedPayload[key]
      const itemBytes =
        encoder.encode(key).length +
        encoder.encode(JSON.stringify(chunk)).length
      expect(itemBytes).toBeLessThan(8192)
      reconstructed += chunk
    }
    expect(JSON.parse(reconstructed)).toEqual(folders)
  })

  it('does not remove old chunks if chrome.storage.sync.set fails', async () => {
    chrome.storage.sync.get.mockResolvedValue({
      [`${userId}_${STORAGE_KEYS.FOLDERS_META}`]: { chunks: 5 },
    })
    chrome.storage.sync.set.mockRejectedValueOnce(new Error('QUOTA_BYTES'))

    await expect(
      Storage.saveFolders(userId, { root: [], uncategorized: [] })
    ).rejects.toThrow('QUOTA_BYTES')
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled()
  })
})
