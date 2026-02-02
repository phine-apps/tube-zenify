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
})
