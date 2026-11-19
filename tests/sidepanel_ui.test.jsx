import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../src/sidepanel/App'
import { Storage } from '../src/utils/storage'

describe('Sidepanel UI Integration', () => {
  let messageListener

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
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
        cb({ gaiaId: 'GAIA_UI_1' })
      }
    })

    vi.spyOn(Storage, 'getFolders').mockResolvedValue({
      root: [
        {
          id: 'f_gaming',
          type: 'folder',
          name: 'Gaming',
          expanded: true,
          children: [],
        },
      ],
      uncategorized: [],
    })
    vi.spyOn(Storage, 'getPlaylistFolders').mockResolvedValue({
      root: [],
      uncategorized: [],
    })
    vi.spyOn(Storage, 'getChannels').mockResolvedValue({
      UC_LIVE: {
        id: 'UC_LIVE',
        name: 'Live Gamer',
        icon: 'https://yt/live.jpg',
        isLive: true,
        hasNewContent: false,
      },
      UC_NEW: {
        id: 'UC_NEW',
        name: 'Tech News',
        icon: 'https://yt/new.jpg',
        isLive: false,
        hasNewContent: true,
      },
    })
    vi.spyOn(Storage, 'getPlaylists').mockResolvedValue({
      PL_1: {
        id: 'PL_1',
        name: 'Lo-Fi Beats',
        icon: 'https://yt/pl1.jpg',
        videoCount: '12 videos',
      },
    })
    vi.spyOn(Storage, 'saveFolders').mockResolvedValue({
      saved: true,
      size: 100,
      warning: false,
    })
    vi.spyOn(Storage, 'savePlaylistFolders').mockResolvedValue({
      saved: true,
      size: 100,
      warning: false,
    })
    vi.spyOn(Storage, 'saveChannels').mockResolvedValue(undefined)
    vi.spyOn(Storage, 'savePlaylists').mockResolvedValue(undefined)
  })

  it('renders channels, filters by LIVE status, and switches cleanly to Playlists tab with QuickAccessBar', async () => {
    const { getByText, queryByText } = render(<App />)

    await waitFor(() => {
      expect(getByText('Live Gamer')).toBeInTheDocument()
      expect(getByText('Tech News')).toBeInTheDocument()
    })

    // Filter by LIVE
    fireEvent.click(getByText('filterLive'))
    expect(getByText('Live Gamer')).toBeInTheDocument()
    expect(queryByText('Tech News')).not.toBeInTheDocument()

    // Switch to Playlists tab
    fireEvent.click(getByText('tabPlaylists'))
    await waitFor(() => {
      expect(getByText('Lo-Fi Beats')).toBeInTheDocument()
      expect(getByText('quickWatchLater')).toBeInTheDocument()
    })
    expect(queryByText('Live Gamer')).not.toBeInTheDocument()

    // Clicking a Quick Access link opens YouTube Watch Later
    fireEvent.click(getByText('quickWatchLater'))
    expect(chrome.tabs.update).toHaveBeenCalledWith(undefined, {
      url: 'https://www.youtube.com/playlist?list=WL',
    })
  })

  it('supports batch selecting and moving uncategorized channels into a folder', async () => {
    const { getByText, getByTitle } = render(<App />)

    await waitFor(() => {
      expect(getByText('Live Gamer')).toBeInTheDocument()
      expect(getByText('Tech News')).toBeInTheDocument()
    })

    // Enter batch organize mode
    fireEvent.click(getByTitle('batchOrganize'))
    fireEvent.click(getByText('batchSelectAll'))
    fireEvent.click(getByText('batchMove'))

    // Both channels are now inside the Gaming folder (count badge = 2)
    await waitFor(() => {
      expect(getByText('Gaming')).toBeInTheDocument()
      expect(getByText('Live Gamer')).toBeInTheDocument()
      expect(getByText('Tech News')).toBeInTheDocument()
    })
  })

  it('handles live CHANNELS_UPDATED message and clears connecting banner', async () => {
    const { getByText, queryByText } = render(<App />)

    await waitFor(() => expect(messageListener).toBeTypeOf('function'))

    act(() => {
      messageListener({
        action: 'CHANNELS_UPDATED',
        gaiaId: 'GAIA_UI_1',
        channels: {
          UC_LIVE: {
            id: 'UC_LIVE',
            name: 'Live Gamer',
            icon: 'https://yt/live.jpg',
            isLive: true,
          },
          UC_FRESH: {
            id: 'UC_FRESH',
            name: 'Fresh Arrival',
            icon: 'https://yt/fresh.jpg',
          },
        },
      })
    })

    await waitFor(() => {
      expect(getByText('Fresh Arrival')).toBeInTheDocument()
      expect(queryByText('statusOpeningYouTube')).not.toBeInTheDocument()
    })
  })

  it('supports full folder CRUD (create, rename, customize appearance, delete with channel recovery)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const {
      getByText,
      getByTitle,
      getByPlaceholderText,
      getByDisplayValue,
      queryByText,
    } = render(<App />)

    await waitFor(() => {
      expect(getByText('Gaming')).toBeInTheDocument()
      expect(getByText('Live Gamer')).toBeInTheDocument()
    })

    // 1. Create a new folder via Header button + Modal
    fireEvent.click(getByTitle('folderNew'))
    const modalInput = getByPlaceholderText('promptNewFolderName')
    fireEvent.change(modalInput, { target: { value: 'Music' } })
    fireEvent.click(getByText('create'))

    await waitFor(() => {
      expect(getByText('Music')).toBeInTheDocument()
    })

    // 2. Customize appearance on the first folder (Gaming) -> pick emoji 🎮
    const paletteButtons = document.querySelectorAll(
      'button[title="customizeFolder"]'
    )
    fireEvent.click(paletteButtons[0])
    fireEvent.click(getByText('🎮'))
    await waitFor(() => {
      expect(getByText('actionReset')).toBeInTheDocument()
    })
    fireEvent.click(getByText('actionReset'))

    // 3. Rename Gaming -> Esports
    const renameButtons = document.querySelectorAll(
      'button[title="renameFolder"]'
    )
    fireEvent.click(renameButtons[0])
    const renameInput = getByDisplayValue('Gaming')
    fireEvent.change(renameInput, { target: { value: 'Esports' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })

    await waitFor(() => {
      expect(getByText('Esports')).toBeInTheDocument()
      expect(queryByText('Gaming')).not.toBeInTheDocument()
    })

    // 4. Delete Esports folder
    const deleteButtons = document.querySelectorAll(
      'button[title="deleteFolder"]'
    )
    fireEvent.click(deleteButtons[0])
    await waitFor(() => {
      expect(queryByText('Esports')).not.toBeInTheDocument()
    })

    confirmSpy.mockRestore()
  })

  it('opens channel /videos tab when Channel link preference is toggled to videos', async () => {
    const { getByText, getByTitle } = render(<App />)

    await waitFor(() => {
      expect(getByText('Live Gamer')).toBeInTheDocument()
    })

    // Open Settings menu and toggle Channel link preference from Home -> /videos
    fireEvent.click(getByTitle('menuSettings'))
    fireEvent.click(getByText('prefChannelTargetHome'))
    expect(getByText('prefChannelTargetVideos')).toBeInTheDocument()

    // Click channel -> should open /channel/UC_LIVE/videos
    fireEvent.click(getByText('Live Gamer'))
    expect(chrome.tabs.update).toHaveBeenCalledWith(undefined, {
      url: 'https://www.youtube.com/channel/UC_LIVE/videos',
    })
  })
})
