import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { ZenProvider } from '../src/sidepanel/context/ZenContext'
import { useZen } from '../src/sidepanel/context/useZen'
import { Storage } from '../src/utils/storage'

function createDeferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('ZenContext & useFolderStructure Integration', () => {
  let messageListener
  let latestZen

  const Inspector = () => {
    const zen = useZen()
    latestZen = zen
    return (
      <div>
        <span data-testid="loaded">{String(zen.isLoaded)}</span>
        <span data-testid="connecting">{String(zen.isConnecting)}</span>
        <span data-testid="channel-count">
          {Object.keys(zen.channels).length}
        </span>
        <span data-testid="uncat-count">
          {zen.folderStructure.uncategorized.length}
        </span>
        <span data-testid="root-count">{zen.folderStructure.root.length}</span>
      </div>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    latestZen = null
    messageListener = null

    chrome.runtime.lastError = null
    chrome.runtime.onMessage.addListener.mockImplementation((fn) => {
      messageListener = fn
    })
    chrome.tabs.query.mockResolvedValue([
      { id: 1, url: 'https://www.youtube.com/' },
    ])
    chrome.tabs.sendMessage.mockImplementation((_tabId, msg, cb) => {
      if (msg.action === 'GET_GAIA_ID') {
        cb({ gaiaId: 'GAIA_USER_1' })
      }
    })

    vi.spyOn(Storage, 'getFolders').mockResolvedValue({
      root: [],
      uncategorized: [],
    })
    vi.spyOn(Storage, 'getPlaylistFolders').mockResolvedValue({
      root: [],
      uncategorized: [],
    })
    vi.spyOn(Storage, 'getChannels').mockResolvedValue({})
    vi.spyOn(Storage, 'getPlaylists').mockResolvedValue({})
    vi.spyOn(Storage, 'saveFolders').mockResolvedValue({
      saved: true,
      size: 64,
      warning: false,
    })
    vi.spyOn(Storage, 'savePlaylistFolders').mockResolvedValue({
      saved: true,
      size: 64,
      warning: false,
    })
    vi.spyOn(Storage, 'saveChannels').mockResolvedValue(undefined)
    vi.spyOn(Storage, 'savePlaylists').mockResolvedValue(undefined)
  })

  it('keeps channels in uncategorized when CHANNELS_UPDATED arrives BEFORE Storage.getFolders resolves (Regression #1)', async () => {
    const deferredFolders = createDeferred()
    Storage.getFolders.mockReturnValueOnce(deferredFolders.promise)

    const { getByTestId } = render(
      <ZenProvider>
        <Inspector />
      </ZenProvider>
    )

    // Wait for message listener to attach
    await waitFor(() => expect(messageListener).toBeTypeOf('function'))

    // Channels arrive BEFORE storage finishes loading
    act(() => {
      messageListener({
        action: 'CHANNELS_UPDATED',
        gaiaId: 'GAIA_USER_1',
        channels: {
          UC_1: { id: 'UC_1', name: 'Channel One', icon: 'https://yt/1.jpg' },
          UC_2: { id: 'UC_2', name: 'Channel Two', icon: 'https://yt/2.jpg' },
        },
      })
    })

    expect(getByTestId('channel-count').textContent).toBe('2')

    // Now storage resolves with an empty structure
    await act(async () => {
      deferredFolders.resolve({ root: [], uncategorized: [] })
      await deferredFolders.promise
    })

    await waitFor(() => {
      expect(getByTestId('loaded').textContent).toBe('true')
      expect(getByTestId('uncat-count').textContent).toBe('2')
    })
  })

  it('restores cached channels on initial load before live scrape arrives', async () => {
    Storage.getChannels.mockResolvedValueOnce({
      UC_CACHED: {
        id: 'UC_CACHED',
        name: 'Cached Channel',
        icon: 'https://yt/c.jpg',
      },
    })

    const { getByTestId } = render(
      <ZenProvider>
        <Inspector />
      </ZenProvider>
    )

    await waitFor(() => {
      expect(getByTestId('loaded').textContent).toBe('true')
      expect(getByTestId('channel-count').textContent).toBe('1')
      expect(getByTestId('uncat-count').textContent).toBe('1')
    })
  })

  it('completes local-to-GAIA migration before loading so migrated folders are preserved', async () => {
    localStorage.setItem('tubezenify_local_user_id', 'local_old_123')

    const migratedFolders = {
      root: [
        {
          id: 'f_mig',
          type: 'folder',
          name: 'Migrated Folder',
          children: ['UC_1'],
        },
      ],
      uncategorized: [],
    }

    let gaiaFoldersStored = { root: [], uncategorized: [] }
    Storage.getFolders.mockImplementation(async (uid) => {
      if (uid === 'local_old_123') return migratedFolders
      return gaiaFoldersStored
    })
    Storage.saveFolders.mockImplementation(async (uid, data) => {
      if (uid === 'GAIA_USER_1') gaiaFoldersStored = data
      return { saved: true, size: 120, warning: false }
    })

    const { getByTestId } = render(
      <ZenProvider>
        <Inspector />
      </ZenProvider>
    )

    await waitFor(() => {
      expect(getByTestId('loaded').textContent).toBe('true')
      expect(getByTestId('root-count').textContent).toBe('1')
    })

    expect(latestZen.folderStructure.root[0].name).toBe('Migrated Folder')
    expect(Storage.saveFolders).toHaveBeenCalledWith(
      'GAIA_USER_1',
      migratedFolders
    )
  })

  it('protects against partial scrape overwrite on the same account, but replaces on account switch', async () => {
    const { getByTestId } = render(
      <ZenProvider>
        <Inspector />
      </ZenProvider>
    )

    await waitFor(() => expect(getByTestId('loaded').textContent).toBe('true'))

    // Full feed arrives (4 channels)
    act(() => {
      messageListener({
        action: 'CHANNELS_UPDATED',
        gaiaId: 'GAIA_USER_1',
        channels: {
          UC_1: { id: 'UC_1', name: 'One' },
          UC_2: { id: 'UC_2', name: 'Two' },
          UC_3: { id: 'UC_3', name: 'Three' },
          UC_4: { id: 'UC_4', name: 'Four' },
        },
      })
    })
    expect(getByTestId('channel-count').textContent).toBe('4')

    // Partial DOM scrape arrives for same account (only 1 channel -> < 50%)
    act(() => {
      messageListener({
        action: 'CHANNELS_UPDATED',
        gaiaId: 'GAIA_USER_1',
        channels: {
          UC_1: { id: 'UC_1', name: 'One (Live)', isLive: true },
        },
      })
    })
    // Must merge instead of wiping out the other 3 channels
    expect(getByTestId('channel-count').textContent).toBe('4')
    expect(latestZen.channels.UC_1.isLive).toBe(true)

    // Account switch to a different GAIA ID replaces channels cleanly
    act(() => {
      messageListener({
        action: 'CHANNELS_UPDATED',
        gaiaId: 'GAIA_USER_2',
        channels: {
          UC_NEW: { id: 'UC_NEW', name: 'Account 2 Channel' },
        },
      })
    })

    await waitFor(() => {
      expect(getByTestId('channel-count').textContent).toBe('1')
      expect(latestZen.channels.UC_NEW.name).toBe('Account 2 Channel')
    })
  })

  it('imports v2 and legacy v1 settings payloads and rejects invalid JSON safely', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    const { getByTestId } = render(
      <ZenProvider>
        <Inspector />
      </ZenProvider>
    )

    await waitFor(() => expect(getByTestId('loaded').textContent).toBe('true'))

    // 1. Valid v2 import (channels + playlists)
    const v2Json = JSON.stringify({
      version: 2,
      channels: {
        root: [
          { id: 'f_v2_ch', type: 'folder', name: 'V2 Channels', children: [] },
        ],
        uncategorized: [{ id: 'UC_1', type: 'channel' }],
      },
      playlists: {
        root: [
          {
            id: 'f_v2_pl',
            type: 'folder',
            name: 'V2 Playlists',
            children: ['PL_1'],
          },
        ],
        uncategorized: [],
      },
    })

    act(() => {
      latestZen.importSettings(v2Json)
    })

    await waitFor(() => {
      expect(getByTestId('root-count').textContent).toBe('1')
      expect(latestZen.folderStructure.root[0].name).toBe('V2 Channels')
    })

    // Switch to playlists tab to verify v2 playlists were imported too
    act(() => {
      latestZen.setActiveTab('playlists')
    })
    await waitFor(() => {
      expect(latestZen.folderStructure.root[0]?.name).toBe('V2 Playlists')
    })

    // 2. Legacy v1 import (channels only)
    act(() => {
      latestZen.setActiveTab('channels')
    })
    const v1Json = JSON.stringify({
      root: [{ id: 'f_v1', type: 'folder', name: 'Legacy V1', children: [] }],
      uncategorized: [],
    })
    act(() => {
      latestZen.importSettings(v1Json)
    })

    await waitFor(() => {
      expect(latestZen.folderStructure.root[0]?.name).toBe('Legacy V1')
    })

    // 3. Invalid JSON must alert and leave current structure intact
    alertSpy.mockClear()
    act(() => {
      latestZen.importSettings('{ invalid json')
    })
    expect(alertSpy).toHaveBeenCalled()
    expect(latestZen.folderStructure.root[0]?.name).toBe('Legacy V1')

    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })
})
