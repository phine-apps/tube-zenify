const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

const CHANNEL_TAB_SUFFIX_RE =
  /\/(featured|videos|shorts|streams|playlists|community|posts|about|channels|releases|podcasts|courses|store)$/i

/**
 * Validates that a URL is a safe HTTPS YouTube URL.
 * @param {string} rawUrl
 * @returns {string | null}
 */
export function sanitizeYouTubeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  try {
    const parsed = new URL(rawUrl, 'https://www.youtube.com')
    if (parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    if (!ALLOWED_YOUTUBE_HOSTS.has(host) && !host.endsWith('.youtube.com')) {
      return null
    }
    return parsed.toString()
  } catch (_e) {
    return null
  }
}

/**
 * Opens a YouTube URL in the active tab, or in a new tab on modifier/middle click.
 * @param {string} url
 * @param {MouseEvent} [event]
 */
export function openYouTubeUrl(url, event) {
  const safeUrl = sanitizeYouTubeUrl(url)
  if (!safeUrl) return
  if (event?.ctrlKey || event?.metaKey || event?.button === 1) {
    chrome.tabs.create({ url: safeUrl })
  } else {
    chrome.tabs.update(undefined, { url: safeUrl })
  }
}

/**
 * Resolves the target URL for a channel based on user preference.
 * @param {string | undefined} rawUrl
 * @param {string} channelId
 * @param {'home' | 'videos'} openChannelTab
 * @returns {string}
 */
export function resolveChannelUrl(rawUrl, channelId, openChannelTab = 'home') {
  const fallback = `https://www.youtube.com/channel/${channelId}`
  const baseUrl = sanitizeYouTubeUrl(rawUrl) || fallback
  if (openChannelTab !== 'videos') return baseUrl

  try {
    const parsed = new URL(baseUrl, 'https://www.youtube.com')
    const cleanPath = parsed.pathname
      .replace(/\/+$/, '')
      .replace(CHANNEL_TAB_SUFFIX_RE, '')
    parsed.pathname = `${cleanPath}/videos`
    return parsed.toString()
  } catch (_e) {
    const trimmed = baseUrl
      .replace(/\/+$/, '')
      .replace(CHANNEL_TAB_SUFFIX_RE, '')
    return `${trimmed}/videos`
  }
}
