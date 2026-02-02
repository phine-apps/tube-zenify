/**
 * This script runs in the MAIN world of YouTube.
 * It has access to the internal JS variables like 'ytd-guide-renderer'.data.
 */
;(() => {
  // Listen for requests from the Content Script (Isolated World)
  window.addEventListener('TUBE_ZENIFY_REQUEST_GUIDE_DATA', () => {
    try {
      const guide = document.querySelector('ytd-guide-renderer')
      const results = []
      const seen = new Set()

      if (guide && (guide.data || guide.__data__)) {
        const data = guide.data || guide.__data__

        function search(obj) {
          if (!obj || typeof obj !== 'object') return

          const item = obj.guideEntryRenderer
          if (item) {
            const id =
              item.channelId ||
              item.navigationEndpoint?.browseEndpoint?.browseId
            const title =
              item.formattedTitle?.simpleText ||
              item.title?.simpleText ||
              item.title

            if (id && title && !seen.has(id)) {
              // STRICT FILTERING (Same as Content Script)
              // 1. ID Format: System items like 'Home' often have short IDs or paths.
              // Real channels start with 'UC' or '@'.
              if (!id.startsWith('UC') && !id.startsWith('@')) return

              const icon = item.thumbnail?.thumbnails?.[0]?.url

              // 2. Icon Validation: System items often have no icon or invalid ones.
              if (!icon || !icon.startsWith('https://')) return

              seen.add(id)

              // LIVE detection
              let isLive = !!item.badges?.liveBroadcasting
              if (!isLive) {
                const badges = item.badges || item.metadataBadgeRenderer
                if (badges) {
                  const badgeArray = Array.isArray(badges) ? badges : [badges]
                  isLive = badgeArray.some((b) => {
                    const r = b.metadataBadgeRenderer || b
                    const label = (
                      r.label?.simpleText ||
                      r.label?.runs?.[0]?.text ||
                      r.label ||
                      ''
                    ).toLowerCase()
                    return (
                      r.style === 'BADGE_STYLE_TYPE_LIVE_NOW' ||
                      label.includes('live') ||
                      label.includes('ライブ')
                    )
                  })
                }
              }

              // NEW CONTENT detection
              const labelMain = item.accessibility?.label || ''
              const labelData =
                item.accessibility?.accessibilityData?.label || ''
              const fullLabel = (labelMain + ' ' + labelData).toLowerCase()

              const hasNew =
                item.presentationStyle ===
                  'GUIDE_ENTRY_PRESENTATION_STYLE_NEW_CONTENT' ||
                item.presentationConfig?.guideEntryPresentationConfig
                  ?.isNewContent ||
                fullLabel.includes('new content') ||
                fullLabel.includes('新しいコンテンツ') ||
                fullLabel.includes('有新内容')

              results.push({
                id,
                name: title,
                icon,
                isLive,
                hasNewContent: hasNew,
              })
            }
          }

          for (const key in obj) {
            if (key !== 'guideEntryRenderer') {
              search(obj[key])
            }
          }
        }

        search(data)
      }

      // Send the data back to the Isolated World
      window.dispatchEvent(
        new CustomEvent('TUBE_ZENIFY_RESPONSE_GUIDE_DATA', { detail: results })
      )
    } catch (_e) {
      window.dispatchEvent(
        new CustomEvent('TUBE_ZENIFY_RESPONSE_GUIDE_DATA', { detail: [] })
      )
    }
  })
})()
