import { useCallback, useEffect } from 'react'
import { Storage } from '../../utils/storage'
import { SYNC_LIMIT } from '../../utils/constants'

export const useFolderStructure = (
  channels,
  setFolderStructure,
  folderStructure, // Need the structure itself to check for existing items
  selectedFolderId
) => {
  const createFolder = useCallback(
    (name) => {
      setFolderStructure((prev) => {
        let targetFolder = null
        let targetChildren = prev.root

        if (selectedFolderId) {
          const findFolder = (nodes) => {
            for (const node of nodes) {
              if (typeof node === 'string') continue
              if (node.type === 'folder') {
                if (node.id === selectedFolderId) return node
                const found = findFolder(node.children || [])
                if (found) return found
              }
            }
            return null
          }
          targetFolder = findFolder(prev.root)
          if (targetFolder) {
            targetChildren = targetFolder.children || []
          }
        }

        const isDuplicate = targetChildren.some((child) => {
          if (typeof child === 'string') return false
          return (
            child.type === 'folder' &&
            child.name.toLowerCase() === name.toLowerCase()
          )
        })

        if (isDuplicate) {
          alert(
            chrome.i18n.getMessage('errorDuplicateFolder') ||
              'A folder with this name already exists.'
          )
          return prev
        }

        const newFolder = {
          id: `f_${Date.now()}`,
          type: 'folder',
          name: name,
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
    [setFolderStructure, selectedFolderId]
  )

  /**
   * Move an item (channel or folder) to a new position in the tree
   * @param {string} dragId ID of the item being moved
   * @param {string} targetId ID of the target item/folder
   * @param {'before' | 'after' | 'inside'} position Position relative to target
   */
  const moveItem = useCallback(
    (dragId, targetId, position = 'inside') => {
      setFolderStructure((prev) => {
        let movedItem = null

        // 1. Recursive helper to remove item and return it
        const removeFromTree = (nodes) => {
          const result = []
          for (const node of nodes) {
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

        // 2. Try removing from root/folders or uncategorized
        let newUncategorized = prev.uncategorized.filter((item) => {
          const itemId = typeof item === 'string' ? item : item.id
          if (itemId === dragId) {
            movedItem = item
            return false
          }
          return true
        })

        let newRoot = removeFromTree(prev.root)

        if (!movedItem) return prev // Item not found

        // Normalize moved item for storage (ensure channels are just IDs if string, or object if preferred)
        // We use string IDs for channels in children for compactness
        const itemToInsert =
          typeof movedItem === 'string'
            ? movedItem
            : movedItem.type === 'channel'
              ? movedItem.id
              : movedItem

        // 3. Validation: Cannot drop folder into its own descendant
        if (
          typeof itemToInsert !== 'string' &&
          itemToInsert.type === 'folder'
        ) {
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
          if (dragId === targetId) return prev
        }

        // 4. Insert at target position
        // Special Case: Move back to Uncategorized (root drop zone)
        if (targetId === 'root' && position === 'inside') {
          const id =
            typeof itemToInsert === 'string' ? itemToInsert : itemToInsert.id
          const isChannel =
            typeof itemToInsert === 'string' || itemToInsert.type === 'channel'

          if (isChannel) {
            if (
              !newUncategorized.some(
                (c) => (typeof c === 'string' ? c : c.id) === id
              )
            ) {
              newUncategorized.push({ id, type: 'channel' })
            }
            return { root: newRoot, uncategorized: newUncategorized }
          } else {
            // Folders move to root list
            if (!newRoot.some((f) => f.id === itemToInsert.id)) {
              newRoot.push(itemToInsert)
            }
            return { root: newRoot, uncategorized: newUncategorized }
          }
        }

        // 5. Insert at target position
        // Check if target is in Uncategorized
        const targetIdx = newUncategorized.findIndex(
          (item) => (typeof item === 'string' ? item : item.id) === targetId
        )

        if (
          targetIdx !== -1 &&
          (position === 'before' || position === 'after')
        ) {
          const id =
            typeof itemToInsert === 'string' ? itemToInsert : itemToInsert.id
          const isChannel =
            typeof itemToInsert === 'string' || itemToInsert.type === 'channel'

          if (isChannel) {
            const newItem = { id, type: 'channel' }
            const result = [...newUncategorized]
            result.splice(
              position === 'before' ? targetIdx : targetIdx + 1,
              0,
              newItem
            )
            newUncategorized = result
          } else {
            // Folders move to root folders list if dropped on an uncategorized channel
            if (!newRoot.some((f) => f.id === itemToInsert.id)) {
              newRoot.push(itemToInsert)
            }
          }
        } else if (targetId === 'root' && position === 'after') {
          // If dropping into root but not at specific position (e.g. empty area)
          newRoot.push(itemToInsert)
        } else {
          // Recursive helper to insert item into tree
          const insertIntoTree = (nodes) => {
            const result = []
            for (let i = 0; i < nodes.length; i++) {
              const node = nodes[i]
              const nodeId = typeof node === 'string' ? node : node.id

              // Case A: Target is before/after this node
              if (
                nodeId === targetId &&
                (position === 'before' || position === 'after')
              ) {
                if (position === 'before') {
                  result.push(itemToInsert)
                  result.push(node)
                } else {
                  result.push(node)
                  result.push(itemToInsert)
                }
                continue
              }

              // Case B: Target is this node (inside position)
              if (
                nodeId === targetId &&
                position === 'inside' &&
                node.type === 'folder'
              ) {
                result.push({
                  ...node,
                  expanded: true,
                  children: [...(node.children || []), itemToInsert],
                })
                continue
              }

              // Case C: Search in children
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

        // 6. SANITIZATION: Ensure root ONLY contains folder objects
        // If any strings (channel IDs) exist in root, move them to uncategorized
        const sanitizedRoot = []
        newRoot.forEach((node) => {
          if (typeof node === 'string') {
            if (
              !newUncategorized.some(
                (c) => (typeof c === 'string' ? c : c.id) === node
              )
            ) {
              newUncategorized.push({ id: node, type: 'channel' })
            }
          } else if (node && node.type === 'folder') {
            sanitizedRoot.push(node)
          } else if (node && node.type === 'channel') {
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
      })
    },
    [setFolderStructure]
  )

  const deleteFolder = useCallback(
    (folderId) => {
      setFolderStructure((prev) => {
        let recoveredIds = []
        const findAndCollect = (nodes) => {
          nodes.forEach((node) => {
            if (typeof node !== 'string' && node.type === 'folder') {
              if (node.id === folderId) {
                const collect = (n) => {
                  if (typeof n === 'string') recoveredIds.push(n)
                  else if (n.type === 'channel') recoveredIds.push(n.id)
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
          return nodes.filter((node) => {
            if (typeof node === 'string') return true
            if (node.id === folderId) return false
            if (node.type === 'folder') {
              node.children = removeFromTree(node.children || [])
              return true
            }
            return true
          })
        }

        const newRoot = removeFromTree([...prev.root])

        const newUncategorized = [
          ...prev.uncategorized,
          ...recoveredIds.map((id) => ({ id, type: 'channel' })),
        ]

        return {
          root: newRoot,
          uncategorized: newUncategorized,
        }
      })
    },
    [setFolderStructure]
  )

  const renameFolder = useCallback(
    (folderId, currentStructure, newName) => {
      if (!newName || !newName.trim()) return

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

  const exportSettings = useCallback((folderStructure) => {
    const data = JSON.stringify(folderStructure, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tubezenify_folders_${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const importSettings = useCallback(
    (jsonString) => {
      try {
        if (jsonString.length > 10 * 1024 * 1024) {
          throw new Error('Import file is too large (max 10MB)')
        }

        const parsed = JSON.parse(jsonString)

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
              throw new Error('Invalid channel ID: too long')
            }
            return
          }

          if (!node || typeof node !== 'object') {
            throw new Error('Invalid node: must be string or object')
          }

          if (node.type === 'channel') {
            if (!node.id || typeof node.id !== 'string') {
              throw new Error('Invalid channel: missing or invalid id')
            }
            if (node.id.length > 200) {
              throw new Error('Invalid channel ID: too long')
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
            `Import data size (${(size / 1024).toFixed(1)}KB) exceeds sync storage limit (${SYNC_LIMIT / 1024}KB). Please reduce the number of folders or channels.`
          )
        }

        if (
          confirm(
            chrome.i18n.getMessage('confirmImportSwaps') ||
              'Importing will overwrite your current folder structure. Continue?'
          )
        ) {
          setFolderStructure({
            root: parsed.root,
            uncategorized: parsed.uncategorized || [],
          })
          alert(chrome.i18n.getMessage('importSuccess') || 'Import successful!')
        }
      } catch (e) {
        console.error('Import failed', e)
        alert(chrome.i18n.getMessage('importFailed') + e.message)
      }
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

  // Sync: Add newly discovered channels to Uncategorized
  useEffect(() => {
    // 1. Gather all IDs currently in the folder structure
    const existingIds = new Set()

    // Helper to traverse
    const traverse = (nodes) => {
      if (!nodes) return
      nodes.forEach((node) => {
        if (typeof node === 'string') {
          existingIds.add(node)
        } else if (node.type === 'channel') {
          existingIds.add(node.id)
        } else if (node.type === 'folder') {
          traverse(node.children)
        }
      })
    }

    if (folderStructure?.root) traverse(folderStructure.root)
    if (folderStructure?.uncategorized) traverse(folderStructure.uncategorized)

    // 2. Find IDs in 'channels' that are NOT in the structure
    const newItems = []
    Object.keys(channels).forEach((channelId) => {
      if (!existingIds.has(channelId)) {
        newItems.push({ id: channelId, type: 'channel' })
      }
    })

    // 3. Update structure if needed
    if (newItems.length > 0) {
      setFolderStructure((prev) => ({
        ...prev,
        uncategorized: [...(prev.uncategorized || []), ...newItems],
      }))
    }
  }, [channels, folderStructure, setFolderStructure])

  return {
    createFolder,
    moveItem,
    deleteFolder,
    renameFolder,
    exportSettings,
    importSettings,
    toggleAllFolders,
    toggleFolder,
  }
}
