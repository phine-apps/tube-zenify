import { useCallback, useEffect } from 'react'
import { SYNC_LIMIT } from '../../utils/constants'
import { Storage } from '../../utils/storage'

/**
 * Validates a folder tree structure ({ root, uncategorized }).
 * Throws an Error if invalid.
 * @param {object} parsed
 */
export function validateFolderStructure(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid structure: must be an object')
  }

  if (!parsed.root || !Array.isArray(parsed.root)) {
    throw new Error('Invalid structure: missing root array')
  }

  if (
    parsed.uncategorized !== undefined &&
    !Array.isArray(parsed.uncategorized)
  ) {
    throw new Error('Invalid structure: uncategorized must be an array')
  }

  const MAX_DEPTH = 50
  const validateNode = (node, depth = 0) => {
    if (depth > MAX_DEPTH) {
      throw new Error(`Structure too deep (max ${MAX_DEPTH} levels)`)
    }

    if (typeof node === 'string') {
      if (node.length > 200) {
        throw new Error('Invalid item ID: too long')
      }
      return
    }

    if (!node || typeof node !== 'object') {
      throw new Error('Invalid node: must be string or object')
    }

    if (node.type === 'channel' || node.type === 'playlist') {
      if (!node.id || typeof node.id !== 'string') {
        throw new Error(`Invalid ${node.type}: missing or invalid id`)
      }
      if (node.id.length > 200) {
        throw new Error(`Invalid ${node.type} ID: too long`)
      }
    } else if (node.type === 'folder') {
      if (!node.id || typeof node.id !== 'string') {
        throw new Error('Invalid folder: missing or invalid id')
      }
      if (!node.name || typeof node.name !== 'string') {
        throw new Error('Invalid folder: missing or invalid name')
      }
      if (node.name.length > 200) {
        throw new Error('Invalid folder name: too long')
      }
      if (
        node.color !== undefined &&
        (typeof node.color !== 'string' || node.color.length > 30)
      ) {
        throw new Error('Invalid folder color')
      }
      if (
        node.icon !== undefined &&
        (typeof node.icon !== 'string' || node.icon.length > 20)
      ) {
        throw new Error('Invalid folder icon')
      }
      if (node.children) {
        if (!Array.isArray(node.children)) {
          throw new Error('Invalid folder: children must be an array')
        }
        if (node.children.length > 10000) {
          throw new Error('Invalid folder: too many children (max 10000)')
        }
        node.children.forEach((child) => validateNode(child, depth + 1))
      }
    } else {
      throw new Error(`Invalid node type: ${node.type}`)
    }
  }

  parsed.root.forEach((node) => validateNode(node))
  if (parsed.uncategorized) {
    parsed.uncategorized.forEach((node) => validateNode(node))
  }

  const size = Storage.calculateSize(parsed)
  if (size > SYNC_LIMIT) {
    throw new Error(
      `Import data size (${(size / 1024).toFixed(1)}KB) exceeds sync storage limit (${SYNC_LIMIT / 1024}KB). Please reduce the number of folders or items.`
    )
  }
}

/**
 * Pure helper to move multiple leaf items to a target folder (or 'root' for uncategorized).
 */
export function batchMoveItemsInTree(
  prev,
  itemIds,
  targetFolderId,
  itemType = 'channel'
) {
  if (!Array.isArray(itemIds) || itemIds.length === 0 || !targetFolderId) {
    return prev
  }

  const idSet = new Set(itemIds)
  const foundIds = []
  const seen = new Set()

  const collectAndStrip = (nodes) => {
    const result = []
    for (const node of nodes || []) {
      const nodeId = typeof node === 'string' ? node : node?.id
      const isFolder =
        node && typeof node === 'object' && node.type === 'folder'

      if (!isFolder && idSet.has(nodeId)) {
        if (!seen.has(nodeId)) {
          seen.add(nodeId)
          foundIds.push(nodeId)
        }
        continue
      }

      if (isFolder) {
        result.push({
          ...node,
          children: collectAndStrip(node.children || []),
        })
      } else {
        result.push(node)
      }
    }
    return result
  }

  const newUncategorized = (prev.uncategorized || []).filter((item) => {
    const itemId = typeof item === 'string' ? item : item?.id
    if (idSet.has(itemId)) {
      if (!seen.has(itemId)) {
        seen.add(itemId)
        foundIds.push(itemId)
      }
      return false
    }
    return true
  })

  const newRoot = collectAndStrip(prev.root || [])

  if (foundIds.length === 0) return prev

  if (targetFolderId === 'root') {
    const existing = new Set(
      newUncategorized.map((c) => (typeof c === 'string' ? c : c.id))
    )
    const additions = foundIds
      .filter((id) => !existing.has(id))
      .map((id) => ({ id, type: itemType }))
    return {
      root: newRoot,
      uncategorized: [...newUncategorized, ...additions],
    }
  }

  let inserted = false
  const insertIntoFolder = (nodes) =>
    nodes.map((node) => {
      if (typeof node === 'string' || node.type !== 'folder') return node
      if (node.id === targetFolderId) {
        inserted = true
        const existingChildren = new Set(
          (node.children || []).map((c) => (typeof c === 'string' ? c : c.id))
        )
        const additions = foundIds.filter((id) => !existingChildren.has(id))
        return {
          ...node,
          expanded: true,
          children: [...(node.children || []), ...additions],
        }
      }
      return {
        ...node,
        children: insertIntoFolder(node.children || []),
      }
    })

  const updatedRoot = insertIntoFolder(newRoot)
  if (!inserted) return prev

  return {
    root: updatedRoot,
    uncategorized: newUncategorized,
  }
}

/**
 * Pure helper to update folder color and/or emoji icon.
 */
export function updateFolderAppearanceInTree(prev, folderId, appearance) {
  const updateNodes = (nodes) =>
    (nodes || []).map((node) => {
      if (typeof node === 'string' || node.type !== 'folder') return node
      if (node.id === folderId) {
        const next = { ...node }
        if ('color' in appearance) {
          if (appearance.color) next.color = appearance.color
          else delete next.color
        }
        if ('icon' in appearance) {
          if (appearance.icon) next.icon = appearance.icon
          else delete next.icon
        }
        return next
      }
      return {
        ...node,
        children: updateNodes(node.children),
      }
    })

  return {
    ...prev,
    root: updateNodes(prev.root),
  }
}

/**
 * Pure helper to move a single item (channel, playlist, or folder) to a new position in the tree.
 * Rolls back to `prev` if the move is invalid (self-drop, ancestor-into-descendant, or missing target).
 */
export function moveItemInTree(
  prev,
  dragId,
  targetId,
  position = 'inside',
  itemType = 'channel'
) {
  if (!dragId || !targetId || dragId === targetId) {
    return prev
  }

  let movedItem = null

  const removeFromTree = (nodes) => {
    const result = []
    for (const node of nodes || []) {
      const nodeId = typeof node === 'string' ? node : node.id
      if (nodeId === dragId) {
        movedItem = node
        continue
      }
      if (typeof node !== 'string' && node.type === 'folder') {
        result.push({
          ...node,
          children: removeFromTree(node.children || []),
        })
      } else {
        result.push(node)
      }
    }
    return result
  }

  let newUncategorized = (prev.uncategorized || []).filter((item) => {
    const itemId = typeof item === 'string' ? item : item.id
    if (itemId === dragId) {
      movedItem = item
      return false
    }
    return true
  })

  let newRoot = removeFromTree(prev.root || [])

  if (!movedItem) return prev

  const isItemLeaf = (node) =>
    typeof node === 'string' ||
    node.type === 'channel' ||
    node.type === 'playlist'

  const itemToInsert =
    typeof movedItem === 'string'
      ? movedItem
      : isItemLeaf(movedItem)
        ? movedItem.id
        : movedItem

  if (typeof itemToInsert !== 'string' && itemToInsert.type === 'folder') {
    const isDescendant = (parent, searchId) => {
      if (!parent.children) return false
      return parent.children.some((child) => {
        const cId = typeof child === 'string' ? child : child.id
        if (cId === searchId) return true
        if (typeof child !== 'string' && child.type === 'folder') {
          return isDescendant(child, searchId)
        }
        return false
      })
    }
    if (isDescendant(itemToInsert, targetId)) return prev
  }

  if (targetId === 'root' && position === 'inside') {
    const id = typeof itemToInsert === 'string' ? itemToInsert : itemToInsert.id
    const isLeaf = isItemLeaf(itemToInsert)

    if (isLeaf) {
      if (
        !newUncategorized.some((c) => (typeof c === 'string' ? c : c.id) === id)
      ) {
        newUncategorized.push({ id, type: itemType })
      }
      return { root: newRoot, uncategorized: newUncategorized }
    } else {
      if (!newRoot.some((f) => f.id === itemToInsert.id)) {
        newRoot.push(itemToInsert)
      }
      return { root: newRoot, uncategorized: newUncategorized }
    }
  }

  const targetIdx = newUncategorized.findIndex(
    (item) => (typeof item === 'string' ? item : item.id) === targetId
  )

  let inserted = false

  if (targetIdx !== -1 && (position === 'before' || position === 'after')) {
    const id = typeof itemToInsert === 'string' ? itemToInsert : itemToInsert.id
    const isLeaf = isItemLeaf(itemToInsert)

    if (isLeaf) {
      const newItem = { id, type: itemType }
      const result = [...newUncategorized]
      result.splice(
        position === 'before' ? targetIdx : targetIdx + 1,
        0,
        newItem
      )
      newUncategorized = result
      inserted = true
    } else {
      if (!newRoot.some((f) => f.id === itemToInsert.id)) {
        newRoot.push(itemToInsert)
      }
      inserted = true
    }
  } else if (targetId === 'root' && position === 'after') {
    newRoot.push(itemToInsert)
    inserted = true
  } else {
    const insertIntoTree = (nodes) => {
      const result = []
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const nodeId = typeof node === 'string' ? node : node.id

        if (
          nodeId === targetId &&
          (position === 'before' || position === 'after')
        ) {
          inserted = true
          if (position === 'before') {
            result.push(itemToInsert)
            result.push(node)
          } else {
            result.push(node)
            result.push(itemToInsert)
          }
          continue
        }

        if (
          nodeId === targetId &&
          position === 'inside' &&
          typeof node !== 'string' &&
          node.type === 'folder'
        ) {
          inserted = true
          result.push({
            ...node,
            expanded: true,
            children: [...(node.children || []), itemToInsert],
          })
          continue
        }

        if (typeof node !== 'string' && node.type === 'folder') {
          result.push({
            ...node,
            children: insertIntoTree(node.children || []),
          })
        } else {
          result.push(node)
        }
      }
      return result
    }
    newRoot = insertIntoTree(newRoot)
  }

  if (!inserted) {
    return prev
  }

  // Sanitization: Ensure root ONLY contains folder objects
  const sanitizedRoot = []
  newRoot.forEach((node) => {
    if (typeof node === 'string') {
      if (
        !newUncategorized.some(
          (c) => (typeof c === 'string' ? c : c.id) === node
        )
      ) {
        newUncategorized.push({ id: node, type: itemType })
      }
    } else if (node && node.type === 'folder') {
      sanitizedRoot.push(node)
    } else if (node && (node.type === 'channel' || node.type === 'playlist')) {
      if (
        !newUncategorized.some(
          (c) => (typeof c === 'string' ? c : c.id) === node.id
        )
      ) {
        newUncategorized.push(node)
      }
    }
  })

  return {
    root: sanitizedRoot,
    uncategorized: newUncategorized,
  }
}

export const useFolderStructure = (
  items,
  setFolderStructure,
  folderStructure,
  selectedFolderId,
  itemType = 'channel'
) => {
  const createFolder = useCallback(
    (name) => {
      const trimmed = typeof name === 'string' ? name.trim() : ''
      if (!trimmed) return
      if (trimmed.length > 200) {
        alert('Folder name is too long (max 200 characters).')
        return
      }

      const findFolder = (nodes) => {
        for (const node of nodes || []) {
          if (typeof node === 'string') continue
          if (node.type === 'folder') {
            if (node.id === selectedFolderId) return node
            const found = findFolder(node.children || [])
            if (found) return found
          }
        }
        return null
      }

      const currentTarget = selectedFolderId
        ? findFolder(folderStructure?.root || [])
        : null
      const currentSiblings = currentTarget
        ? currentTarget.children || []
        : folderStructure?.root || []

      const isDuplicate = currentSiblings.some(
        (child) =>
          typeof child !== 'string' &&
          child.type === 'folder' &&
          child.name.toLowerCase() === trimmed.toLowerCase()
      )

      if (isDuplicate) {
        alert(
          chrome.i18n.getMessage('errorDuplicateFolder') ||
            'A folder with this name already exists.'
        )
        return
      }

      setFolderStructure((prev) => {
        const targetFolder = selectedFolderId ? findFolder(prev.root) : null
        const targetChildren = targetFolder
          ? targetFolder.children || []
          : prev.root

        const alreadyExists = targetChildren.some(
          (child) =>
            typeof child !== 'string' &&
            child.type === 'folder' &&
            child.name.toLowerCase() === trimmed.toLowerCase()
        )
        if (alreadyExists) return prev

        const newFolder = {
          id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'folder',
          name: trimmed,
          children: [],
        }

        if (!targetFolder) {
          return {
            ...prev,
            root: [...prev.root, newFolder],
          }
        } else {
          const addToTree = (nodes) => {
            return nodes.map((node) => {
              if (typeof node === 'string') return node
              if (node.type === 'folder') {
                if (node.id === selectedFolderId) {
                  return {
                    ...node,
                    expanded: true,
                    children: [...(node.children || []), newFolder],
                  }
                }
                return {
                  ...node,
                  children: addToTree(node.children || []),
                }
              }
              return node
            })
          }
          return {
            ...prev,
            root: addToTree(prev.root),
          }
        }
      })
    },
    [setFolderStructure, folderStructure, selectedFolderId]
  )

  /**
   * Move an item (channel, playlist, or folder) to a new position in the tree
   * @param {string} dragId ID of the item being moved
   * @param {string} targetId ID of the target item/folder
   * @param {'before' | 'after' | 'inside'} position Position relative to target
   */
  const moveItem = useCallback(
    (dragId, targetId, position = 'inside') => {
      setFolderStructure((prev) =>
        moveItemInTree(prev, dragId, targetId, position, itemType)
      )
    },
    [setFolderStructure, itemType]
  )

  const moveItemsBatch = useCallback(
    (itemIds, targetFolderId) => {
      setFolderStructure((prev) =>
        batchMoveItemsInTree(prev, itemIds, targetFolderId, itemType)
      )
    },
    [setFolderStructure, itemType]
  )

  const updateFolderAppearance = useCallback(
    (folderId, appearance) => {
      setFolderStructure((prev) =>
        updateFolderAppearanceInTree(prev, folderId, appearance)
      )
    },
    [setFolderStructure]
  )

  const deleteFolder = useCallback(
    (folderId) => {
      setFolderStructure((prev) => {
        const recoveredIds = []
        const findAndCollect = (nodes) => {
          nodes.forEach((node) => {
            if (typeof node !== 'string' && node.type === 'folder') {
              if (node.id === folderId) {
                const collect = (n) => {
                  if (typeof n === 'string') recoveredIds.push(n)
                  else if (n.type === 'channel' || n.type === 'playlist')
                    recoveredIds.push(n.id)
                  else if (n.type === 'folder' && n.children)
                    n.children.forEach(collect)
                }
                if (node.children) node.children.forEach(collect)
              } else {
                if (node.children) findAndCollect(node.children)
              }
            }
          })
        }
        findAndCollect(prev.root)

        const removeFromTree = (nodes) => {
          return nodes
            .filter((node) => typeof node === 'string' || node.id !== folderId)
            .map((node) => {
              if (typeof node !== 'string' && node.type === 'folder') {
                return {
                  ...node,
                  children: removeFromTree(node.children || []),
                }
              }
              return node
            })
        }

        const newRoot = removeFromTree(prev.root)
        const existingUncatIds = new Set(
          prev.uncategorized.map((u) => (typeof u === 'string' ? u : u.id))
        )
        const newUncategorized = [
          ...prev.uncategorized,
          ...recoveredIds
            .filter((id) => !existingUncatIds.has(id))
            .map((id) => ({ id, type: itemType })),
        ]

        return {
          root: newRoot,
          uncategorized: newUncategorized,
        }
      })
    },
    [setFolderStructure, itemType]
  )

  const renameFolder = useCallback(
    (folderId, currentStructure, newName) => {
      const trimmed = typeof newName === 'string' ? newName.trim() : ''
      if (!trimmed) return
      if (trimmed.length > 200) {
        alert('Folder name is too long (max 200 characters).')
        return
      }

      const findFolderAndParent = (nodes, parent = null) => {
        for (const node of nodes) {
          if (typeof node === 'string') continue
          if (node.type === 'folder') {
            if (node.id === folderId) {
              return { folder: node, parent }
            }
            const found = findFolderAndParent(node.children || [], node)
            if (found) return found
          }
        }
        return null
      }

      const found = findFolderAndParent(currentStructure.root)
      if (!found) return

      const siblings = found.parent
        ? found.parent.children || []
        : currentStructure.root

      const isDuplicate = siblings.some(
        (sibling) =>
          typeof sibling !== 'string' &&
          sibling.type === 'folder' &&
          sibling.id !== folderId &&
          sibling.name.toLowerCase() === newName.trim().toLowerCase()
      )

      if (isDuplicate) {
        alert(
          chrome.i18n.getMessage('errorDuplicateFolder') ||
            'A folder with this name already exists.'
        )
        return
      }

      setFolderStructure((prev) => {
        const updateNameInTree = (nodes) => {
          return nodes.map((node) => {
            if (typeof node === 'string') return node
            if (node.type === 'folder') {
              if (node.id === folderId) {
                return { ...node, name: newName.trim() }
              }
              return {
                ...node,
                children: updateNameInTree(node.children || []),
              }
            }
            return node
          })
        }

        return {
          ...prev,
          root: updateNameInTree(prev.root),
        }
      })
    },
    [setFolderStructure]
  )

  const toggleAllFolders = useCallback(
    (expanded) => {
      setFolderStructure((prev) => {
        const updateExpandedInTree = (nodes) => {
          return nodes.map((node) => {
            if (typeof node === 'string') return node
            if (node.type === 'folder') {
              return {
                ...node,
                expanded: expanded,
                children: updateExpandedInTree(node.children || []),
              }
            }
            return node
          })
        }

        return {
          ...prev,
          root: updateExpandedInTree(prev.root),
        }
      })
    },
    [setFolderStructure]
  )

  const toggleFolder = useCallback(
    (folderId, expanded) => {
      setFolderStructure((prev) => {
        const updateInTree = (nodes) => {
          return nodes.map((node) => {
            if (typeof node === 'string') return node
            if (node.type === 'folder') {
              if (node.id === folderId) {
                return { ...node, expanded: expanded }
              }
              return {
                ...node,
                children: updateInTree(node.children || []),
              }
            }
            return node
          })
        }

        return {
          ...prev,
          root: updateInTree(prev.root),
        }
      })
    },
    [setFolderStructure]
  )

  // Sync: Add newly discovered items to Uncategorized (computed atomically against latest prev)
  useEffect(() => {
    const itemKeys = Object.keys(items || {})
    if (itemKeys.length === 0) return

    setFolderStructure((prev) => {
      const existingIds = new Set()

      const traverse = (nodes) => {
        if (!nodes) return
        nodes.forEach((node) => {
          if (typeof node === 'string') {
            existingIds.add(node)
          } else if (node.type === 'channel' || node.type === 'playlist') {
            existingIds.add(node.id)
          } else if (node.type === 'folder') {
            traverse(node.children)
          }
        })
      }

      if (prev?.root) traverse(prev.root)
      if (prev?.uncategorized) traverse(prev.uncategorized)

      const newItems = []
      itemKeys.forEach((itemId) => {
        if (!existingIds.has(itemId)) {
          newItems.push({ id: itemId, type: itemType })
        }
      })

      if (newItems.length === 0) return prev
      return {
        ...prev,
        uncategorized: [...(prev.uncategorized || []), ...newItems],
      }
    })
  }, [items, folderStructure, setFolderStructure, itemType])

  return {
    createFolder,
    moveItem,
    moveItemsBatch,
    updateFolderAppearance,
    deleteFolder,
    renameFolder,
    toggleAllFolders,
    toggleFolder,
  }
}
