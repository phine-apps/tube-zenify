import { describe, it, expect, beforeEach } from 'vitest'
import { scrapeChannels } from '../src/content/index'

describe('Content Script Scraper', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('returns empty object when no guides found', () => {
    const result = scrapeChannels()
    expect(result.channels).toEqual({})
  })

  it('scrapes valid channel from sidebar', () => {
    document.body.innerHTML = `
      <ytd-guide-section-renderer>
        <ytd-guide-entry-renderer>
          <a id="endpoint" href="/channel/UC123" title="Test Channel">
            <yt-img-shadow>
              <img src="https://example.com/icon.jpg">
            </yt-img-shadow>
            <span class="title">Test Channel</span>
          </a>
        </ytd-guide-entry-renderer>
      </ytd-guide-section-renderer>
    `

    const result = scrapeChannels()
    expect(result.channels['UC123']).toBeDefined() // ID stripped of channel/
    expect(result.channels['UC123'].name).toBe('Test Channel')
    expect(result.channels['UC123'].isLive).toBe(false)
  })

  it('detects live badge via overlay-style', () => {
    document.body.innerHTML = `
      <ytd-guide-section-renderer>
        <ytd-guide-entry-renderer>
          <a href="/channel/UC456" title="Live Channel">
            <yt-img-shadow><img src="https://example.com/icon.jpg"></yt-img-shadow>
            <span class="title">Live Channel</span>
            <div overlay-style="LIVE">LIVE</div> 
          </a>
        </ytd-guide-entry-renderer>
      </ytd-guide-section-renderer>
    `

    const result = scrapeChannels()
    expect(result.channels['UC456'].isLive).toBe(true)
  })

  it('detects live status via class match', () => {
    document.body.innerHTML = `
      <ytd-guide-section-renderer>
         <ytd-guide-entry-renderer>
           <a href="/channel/UC_DARK" title="Dark Mode Live">
             <yt-img-shadow><img src="https://example.com/icon.jpg"></yt-img-shadow>
             <span class="title">Dark Mode Live</span>
             <div class="badge-style-type-live-now-alternate style-scope ytd-badge-supported-renderer"></div>
           </a>
         </ytd-guide-entry-renderer>
      </ytd-guide-section-renderer>
    `
    const result = scrapeChannels()
    expect(result.channels['UC_DARK']).toBeDefined()
    expect(result.channels['UC_DARK'].isLive).toBe(true)
  })

  it('detects new content dot', () => {
    document.body.innerHTML = `
      <ytd-guide-section-renderer>
         <ytd-guide-entry-renderer>
           <a href="/channel/UC_NEW" title="New Content Channel">
             <yt-img-shadow><img src="https://example.com/icon.jpg"></yt-img-shadow>
             <span class="title">New Content Channel</span>
             <div id="newness-dot"></div>
           </a>
         </ytd-guide-entry-renderer>
      </ytd-guide-section-renderer>
    `
    const result = scrapeChannels()
    expect(result.channels['UC_NEW'].hasNewContent).toBe(true)
  })

  // Add tests for mergeChannels
  describe('mergeChannels', async () => {
    it('merges fetched and scraped data', async () => {
      const fetched = {
        UC1: { id: 'UC1', name: 'Fetched Name', isLive: false },
      }
      const scraped = {
        UC1: { id: 'UC1', name: 'Scraped Name', isLive: true },
      }

      const { mergeChannels } = await import('../src/content/index')
      const merged = mergeChannels(fetched, scraped)

      // Should prefer fetched ID existence, but update status/name from scraped if available
      expect(merged['UC1'].isLive).toBe(true)
      expect(merged['UC1'].name).toBe('Scraped Name')
    })

    it('adds new channels from scraped data if not in fetched', async () => {
      const fetched = {}
      const scraped = {
        UC2: { id: 'UC2', name: 'New Channel' },
      }

      const { mergeChannels } = await import('../src/content/index')
      const merged = mergeChannels(fetched, scraped)

      expect(merged['UC2']).toBeDefined()
      expect(merged['UC2'].name).toBe('New Channel')
    })
  })

  describe('scrapePlaylists and mergePlaylists', () => {
    it('scrapes user playlists from DOM and ignores system playlists (WL/LL)', async () => {
      document.body.innerHTML = `
        <ytd-guide-section-renderer>
          <ytd-guide-entry-renderer>
            <a href="/playlist?list=WL"><span class="title">Watch Later</span></a>
          </ytd-guide-entry-renderer>
          <ytd-guide-entry-renderer>
            <a href="/playlist?list=LL"><span class="title">Liked Videos</span></a>
          </ytd-guide-entry-renderer>
          <ytd-guide-entry-renderer>
            <a href="/playlist?list=PL_CUSTOM_1"><span class="title">Chill Beats</span></a>
          </ytd-guide-entry-renderer>
        </ytd-guide-section-renderer>
        <ytd-grid-playlist-renderer>
          <a href="/playlist?list=PL_GRID_2">
            <img src="https://i.ytimg.com/vi/xyz/default.jpg">
            <span id="video-title">Tech Talks</span>
          </a>
        </ytd-grid-playlist-renderer>
      `

      const { scrapePlaylists } = await import('../src/content/index')
      const result = scrapePlaylists()

      expect(result.playlists['WL']).toBeUndefined()
      expect(result.playlists['LL']).toBeUndefined()
      expect(result.playlists['PL_CUSTOM_1']).toEqual({
        id: 'PL_CUSTOM_1',
        name: 'Chill Beats',
        icon: '',
        url: 'https://www.youtube.com/playlist?list=PL_CUSTOM_1',
      })
      expect(result.playlists['PL_GRID_2']).toEqual({
        id: 'PL_GRID_2',
        name: 'Tech Talks',
        icon: 'https://i.ytimg.com/vi/xyz/default.jpg',
        url: 'https://www.youtube.com/playlist?list=PL_GRID_2',
      })
    })

    it('merges fetched and scraped playlists preserving icons', async () => {
      const { mergePlaylists } = await import('../src/content/index')
      const merged = mergePlaylists(
        {
          PL1: {
            id: 'PL1',
            name: 'Fetched Title',
            icon: '',
            url: 'https://www.youtube.com/playlist?list=PL1',
          },
        },
        {
          PL1: {
            id: 'PL1',
            name: 'Scraped Title',
            icon: 'https://i.ytimg.com/vi/1/default.jpg',
          },
          PL2: {
            id: 'PL2',
            name: 'Extra Playlist',
            icon: '',
          },
        }
      )

      expect(merged['PL1'].name).toBe('Scraped Title')
      expect(merged['PL1'].icon).toBe('https://i.ytimg.com/vi/1/default.jpg')
      expect(merged['PL2'].url).toBe(
        'https://www.youtube.com/playlist?list=PL2'
      )
    })

    it('scrapes /watch?...list= lockup cards only on /feed/playlists or /feed/library', async () => {
      const { scrapePlaylists } = await import('../src/content/index')
      document.body.innerHTML = `
        <yt-lockup-view-model>
          <a href="/watch?v=vid1&list=PL_FEED_WATCH">
            <img src="https://i.ytimg.com/vi/vid1/hq.jpg">
          </a>
          <a class="yt-lockup-metadata-view-model__title" href="/playlist?list=PL_FEED_WATCH">
            Saved Feed Playlist
          </a>
        </yt-lockup-view-model>
        <yt-lockup-view-model>
          <a href="/watch?v=vid2&list=PL_WATCH_ONLY">
            <span class="yt-lockup-metadata-view-model__title">Watch Only Mix</span>
          </a>
        </yt-lockup-view-model>
      `

      try {
        window.history.pushState({}, '', '/watch?v=vid2')
        const onWatch = scrapePlaylists()
        expect(onWatch.playlists['PL_FEED_WATCH']).toBeDefined()
        expect(onWatch.playlists['PL_WATCH_ONLY']).toBeUndefined()

        window.history.pushState({}, '', '/feed/playlists')
        const onFeed = scrapePlaylists()
        expect(onFeed.playlists['PL_FEED_WATCH']).toBeDefined()
        expect(onFeed.playlists['PL_WATCH_ONLY']).toEqual({
          id: 'PL_WATCH_ONLY',
          name: 'Watch Only Mix',
          icon: '',
          url: 'https://www.youtube.com/playlist?list=PL_WATCH_ONLY',
        })
      } finally {
        window.history.pushState({}, '', '/')
      }
    })
  })
})
