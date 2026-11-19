function getNodeId(node) {
  return typeof node === 'string' ? node : node?.id
}

function getFolderStatusRank(folder, itemsMap) {
  let hasLive = false
  let hasNew = false

  const scan = (nodes) => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (node && typeof node === 'object' && node.type === 'folder') {
        scan(node.children)
      } else {
        const item = itemsMap[getNodeId(node)]
        if (item?.isLive) hasLive = true
        if (item?.hasNewContent) hasNew = true
      }
      if (hasLive) return
    }
  }

  scan(folder.children)
  if (hasLive) return 2
  if (hasNew) return 1
  return 0
}

function getItemStatusRank(item) {
  if (item?.isLive) return 2
  if (item?.hasNewContent) return 1
  return 0
}

function sortNodes(nodes, itemsMap, sortBy, activeTab) {
  if (!Array.isArray(nodes) || sortBy === 'manual') return nodes

  const isFolder = (n) => n && typeof n === 'object' && n.type === 'folder'

  return [...nodes].sort((a, b) => {
    const aFolder = isFolder(a)
    const bFolder = isFolder(b)

    // Keep folders grouped before leaf items when sorting
    if (aFolder !== bFolder) {
      return aFolder ? -1 : 1
    }

    if (sortBy === 'status' && activeTab === 'channels') {
      const rankA = aFolder
        ? getFolderStatusRank(a, itemsMap)
        : getItemStatusRank(itemsMap[getNodeId(a)])
      const rankB = bFolder
        ? getFolderStatusRank(b, itemsMap)
        : getItemStatusRank(itemsMap[getNodeId(b)])
      if (rankA !== rankB) {
        return rankB - rankA
      }
    }

    const nameA = aFolder
      ? a.name || ''
      : itemsMap[getNodeId(a)]?.name || getNodeId(a) || ''
    const nameB = bFolder
      ? b.name || ''
      : itemsMap[getNodeId(b)]?.name || getNodeId(b) || ''

    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
  })
}

/**
 * Filters and sorts a folder tree without mutating the underlying persisted structure.
 */
export function filterAndSortTree(
  structure,
  itemsMap,
  {
    searchTerm = '',
    statusFilter = 'all',
    sortBy = 'manual',
    activeTab = 'channels',
  } = {}
) {
  const safeStructure = structure || { root: [], uncategorized: [] }
  const term = searchTerm.trim().toLowerCase()
  const effectiveStatusFilter = activeTab === 'channels' ? statusFilter : 'all'
  const hasActiveFilter = Boolean(term) || effectiveStatusFilter !== 'all'

  const matchesLeaf = (node) => {
    const item = itemsMap[getNodeId(node)]
    if (!item) return false
    if (effectiveStatusFilter === 'live' && !item.isLive) return false
    if (effectiveStatusFilter === 'new' && !item.hasNewContent) return false
    if (term && !item.name?.toLowerCase().includes(term)) return false
    return true
  }

  const processList = (list) => {
    const mapped = (list || [])
      .map((node) => {
        if (node && typeof node === 'object' && node.type === 'folder') {
          const processedChildren = processList(node.children || [])
          if (!hasActiveFilter) {
            return sortBy === 'manual'
              ? node
              : { ...node, children: processedChildren }
          }

          const folderNameMatches =
            effectiveStatusFilter === 'all' &&
            Boolean(term) &&
            node.name?.toLowerCase().includes(term)

          if (processedChildren.length > 0 || folderNameMatches) {
            return {
              ...node,
              children: processedChildren,
              expanded: true,
            }
          }
          return null
        }

        if (!hasActiveFilter) return node
        return matchesLeaf(node) ? node : null
      })
      .filter(Boolean)

    return sortNodes(mapped, itemsMap, sortBy, activeTab)
  }

  return {
    root: processList(safeStructure.root),
    uncategorized: processList(safeStructure.uncategorized),
  }
}

/**
 * Flattens all folders into a list of { id, label, depth } for dropdown selection.
 */
export function flattenFolders(rootNodes, prefix = '', depth = 0) {
  if (!Array.isArray(rootNodes)) return []
  const result = []

  for (const node of rootNodes) {
    if (node && typeof node === 'object' && node.type === 'folder') {
      const label = prefix ? `${prefix} / ${node.name}` : node.name
      result.push({ id: node.id, name: node.name, label, depth })
      if (node.children?.length) {
        result.push(...flattenFolders(node.children, label, depth + 1))
      }
    }
  }

  return result
}
