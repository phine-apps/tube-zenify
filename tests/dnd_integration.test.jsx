import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { ZenProvider } from '../src/sidepanel/context/ZenContext'
import { useZen } from '../src/sidepanel/context/useZen'
import FolderTree from '../src/sidepanel/components/FolderTree'
import { Storage } from '../src/utils/storage'

describe('Drag & Drop Integration across Tabs (Regression C-1)', () => {
  let latestZen

  const TestHarness = () => {
    const zen = useZen()
    latestZen = zen
    return (
      <div>
        <button type="button" onClick={() => zen.setActiveTab('channels')}>
          Switch Channels
        </button>
        <button type="button" onClick={() => zen.setActiveTab('playlists')}>
          Switch Playlists
        </button>
        <FolderTree />
      </div>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    latestZen = null

    chrome.runtime.lastError = null
    chrome.tabs.query.mockResolvedValue([
      { id: 1, url: 'https://www.youtube.com/' },
    ])
    chrome.tabs.sendMessage.mockImplementation((_tabId, msg, cb) => {
      if (msg.action === 'GET_GAIA_ID') {
        cb({ gaiaId: 'GAIA_DND_1' })
      }
    })

    vi.spyOn(Storage, 'getFolders').mockResolvedValue({
      root: [
        {
          id: 'f_ch',
          type: 'folder',
          name: 'Channel Folder',
          expanded: true,
          children: [],
        },
      ],
      uncategorized: [{ id: 'UC_1', type: 'channel' }],
    })
    vi.spyOn(Storage, 'getPlaylistFolders').mockResolvedValue({
      root: [
        {
          id: 'f_pl',
          type: 'folder',
          name: 'Playlist Folder',
          expanded: true,
          children: ['PL_1'],
        },
      ],
      uncategorized: [],
    })
    vi.spyOn(Storage, 'getChannels').mockResolvedValue({
      UC_1: { id: 'UC_1', name: 'Draggable Channel', icon: 'https://yt/1.jpg' },
    })
    vi.spyOn(Storage, 'getPlaylists').mockResolvedValue({
      PL_1: {
        id: 'PL_1',
        name: 'Draggable Playlist',
        icon: 'https://yt/p.jpg',
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

  it('moves a channel into a folder via drag & drop, and still moves a playlist to root after switching to Playlists tab', async () => {
    const { getByText } = render(
      <ZenProvider>
        <DndProvider backend={HTML5Backend}>
          <TestHarness />
        </DndProvider>
      </ZenProvider>
    )

    await waitFor(() => {
      expect(getByText('Channel Folder')).toBeInTheDocument()
      expect(getByText('Draggable Channel')).toBeInTheDocument()
    })

    // Mock bounding rect on Folder header so middle (50%) resolves to 'inside'
    const folderRow = getByText('Channel Folder').closest('[draggable="true"]')
    const channelRow =
      getByText('Draggable Channel').closest('[draggable="true"]')
    expect(folderRow).toBeTruthy()
    expect(channelRow).toBeTruthy()

    vi.spyOn(folderRow, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 40,
      left: 0,
      right: 200,
      width: 200,
      height: 40,
    })

    // 1. Drag channel into Channel Folder
    act(() => {
      fireEvent.dragStart(channelRow)
      fireEvent.dragEnter(folderRow, { clientX: 50, clientY: 20 })
      fireEvent.dragOver(folderRow, { clientX: 50, clientY: 20 })
      fireEvent.drop(folderRow, { clientX: 50, clientY: 20 })
      fireEvent.dragEnd(channelRow)
    })

    await waitFor(() => {
      expect(latestZen.folderStructure.root[0].children).toContain('UC_1')
      expect(latestZen.folderStructure.uncategorized).toHaveLength(0)
    })

    // 2. Switch to Playlists tab and drag PL_1 from Playlist Folder to FolderTree root
    fireEvent.click(getByText('Switch Playlists'))

    await waitFor(() => {
      expect(getByText('Playlist Folder')).toBeInTheDocument()
      expect(getByText('Draggable Playlist')).toBeInTheDocument()
    })

    const playlistRow =
      getByText('Draggable Playlist').closest('[draggable="true"]')
    const rootDropZone =
      getByText('Playlist Folder').closest('.overflow-y-auto')
    expect(playlistRow).toBeTruthy()
    expect(rootDropZone).toBeTruthy()

    act(() => {
      fireEvent.dragStart(playlistRow)
      fireEvent.dragEnter(rootDropZone, { clientX: 50, clientY: 200 })
      fireEvent.dragOver(rootDropZone, { clientX: 50, clientY: 200 })
      fireEvent.drop(rootDropZone, { clientX: 50, clientY: 200 })
      fireEvent.dragEnd(playlistRow)
    })

    await waitFor(() => {
      expect(latestZen.folderStructure.root[0].children).toEqual([])
      expect(latestZen.folderStructure.uncategorized).toEqual([
        { id: 'PL_1', type: 'playlist' },
      ])
    })
  })
})
