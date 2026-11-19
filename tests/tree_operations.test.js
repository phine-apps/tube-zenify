import { describe, it, expect } from 'vitest'
import {
  filterAndSortTree,
  flattenFolders,
} from '../src/sidepanel/utils/treeFilter'
import {
  batchMoveItemsInTree,
  moveItemInTree,
  updateFolderAppearanceInTree,
  validateFolderStructure,
} from '../src/sidepanel/hooks/useFolderStructure'

const SAMPLE_ITEMS = {
  UC_B: {
    id: 'UC_B',
    name: 'Beta Channel',
    isLive: false,
    hasNewContent: true,
  },
  UC_A: {
    id: 'UC_A',
    name: 'Alpha Channel',
    isLive: false,
    hasNewContent: false,
  },
  UC_L: {
    id: 'UC_L',
    name: 'Live Streamer',
    isLive: true,
    hasNewContent: false,
  },
}

const SAMPLE_TREE = {
  root: [
    {
      id: 'f_1',
      type: 'folder',
      name: 'Zebra Folder',
      expanded: false,
      children: ['UC_B', 'UC_A'],
    },
    {
      id: 'f_2',
      type: 'folder',
      name: 'Alpha Folder',
      expanded: false,
      children: [
        {
          id: 'f_sub',
          type: 'folder',
          name: 'Nested',
          expanded: false,
          children: ['UC_L'],
        },
      ],
    },
  ],
  uncategorized: [
    { id: 'UC_B', type: 'channel' },
    { id: 'UC_L', type: 'channel' },
  ],
}

describe('Tree Filtering & Sorting', () => {
  it('filters live channels and keeps matching ancestor folders expanded', () => {
    const filtered = filterAndSortTree(SAMPLE_TREE, SAMPLE_ITEMS, {
      statusFilter: 'live',
      activeTab: 'channels',
    })

    expect(filtered.root).toHaveLength(1)
    expect(filtered.root[0].id).toBe('f_2')
    expect(filtered.root[0].expanded).toBe(true)
    expect(filtered.root[0].children[0].children).toEqual(['UC_L'])
    expect(filtered.uncategorized).toEqual([{ id: 'UC_L', type: 'channel' }])
  })

  it('filters new content channels', () => {
    const filtered = filterAndSortTree(SAMPLE_TREE, SAMPLE_ITEMS, {
      statusFilter: 'new',
      activeTab: 'channels',
    })

    expect(filtered.root).toHaveLength(1)
    expect(filtered.root[0].id).toBe('f_1')
    expect(filtered.root[0].children).toEqual(['UC_B'])
    expect(filtered.uncategorized).toEqual([{ id: 'UC_B', type: 'channel' }])
  })

  it('sorts folders and items alphabetically without mutating original tree', () => {
    const sorted = filterAndSortTree(SAMPLE_TREE, SAMPLE_ITEMS, {
      sortBy: 'name',
      activeTab: 'channels',
    })

    expect(sorted.root.map((f) => f.name)).toEqual([
      'Alpha Folder',
      'Zebra Folder',
    ])
    expect(sorted.root[1].children).toEqual(['UC_A', 'UC_B'])
    // Original order preserved
    expect(SAMPLE_TREE.root[0].name).toBe('Zebra Folder')
  })

  it('sorts by live and new status priority', () => {
    const sorted = filterAndSortTree(SAMPLE_TREE, SAMPLE_ITEMS, {
      sortBy: 'status',
      activeTab: 'channels',
    })

    expect(sorted.root.map((f) => f.id)).toEqual(['f_2', 'f_1'])
    expect(sorted.uncategorized.map((n) => n.id)).toEqual(['UC_L', 'UC_B'])
  })

  it('flattens nested folders with hierarchical labels', () => {
    expect(flattenFolders(SAMPLE_TREE.root)).toEqual([
      { id: 'f_1', name: 'Zebra Folder', label: 'Zebra Folder', depth: 0 },
      { id: 'f_2', name: 'Alpha Folder', label: 'Alpha Folder', depth: 0 },
      { id: 'f_sub', name: 'Nested', label: 'Alpha Folder / Nested', depth: 1 },
    ])
  })
})

describe('Batch Move & Folder Appearance', () => {
  it('moves multiple uncategorized items into a target folder without duplicates', () => {
    const tree = {
      root: [{ id: 'f_1', type: 'folder', name: 'Target', children: ['UC_1'] }],
      uncategorized: [
        { id: 'UC_1', type: 'channel' },
        { id: 'UC_2', type: 'channel' },
        { id: 'UC_3', type: 'channel' },
      ],
    }

    const updated = batchMoveItemsInTree(
      tree,
      ['UC_1', 'UC_2'],
      'f_1',
      'channel'
    )

    expect(updated.root[0].expanded).toBe(true)
    expect(updated.root[0].children).toEqual(['UC_1', 'UC_2'])
    expect(updated.uncategorized).toEqual([{ id: 'UC_3', type: 'channel' }])
  })

  it('updates and resets folder color and emoji icon', () => {
    const tree = {
      root: [{ id: 'f_1', type: 'folder', name: 'Music', children: [] }],
      uncategorized: [],
    }

    const withAppearance = updateFolderAppearanceInTree(tree, 'f_1', {
      color: 'violet',
      icon: '🎵',
    })
    expect(withAppearance.root[0].color).toBe('violet')
    expect(withAppearance.root[0].icon).toBe('🎵')

    const reset = updateFolderAppearanceInTree(withAppearance, 'f_1', {
      icon: '',
    })
    expect(reset.root[0].color).toBe('violet')
    expect(reset.root[0].icon).toBeUndefined()
  })

  it('validates folder color and icon metadata', () => {
    expect(() =>
      validateFolderStructure({
        root: [
          {
            id: 'f_1',
            type: 'folder',
            name: 'Gaming',
            color: 'blue',
            icon: '🎮',
            children: [],
          },
        ],
      })
    ).not.toThrow()

    expect(() =>
      validateFolderStructure({
        root: [
          {
            id: 'f_1',
            type: 'folder',
            name: 'Invalid',
            color: 123,
            children: [],
          },
        ],
      })
    ).toThrow(/Invalid folder color/)
  })

  it('moveItemInTree rolls back safely on self-drop, descendant drop, or missing target', () => {
    const tree = {
      root: [
        {
          id: 'f_parent',
          type: 'folder',
          name: 'Parent',
          children: [
            {
              id: 'f_child',
              type: 'folder',
              name: 'Child',
              children: ['UC_1'],
            },
          ],
        },
      ],
      uncategorized: [{ id: 'UC_2', type: 'channel' }],
    }

    // Leaf self-drop must not delete the leaf
    expect(moveItemInTree(tree, 'UC_1', 'UC_1', 'before', 'channel')).toBe(tree)
    // Folder self-drop must not delete the folder
    expect(
      moveItemInTree(tree, 'f_parent', 'f_parent', 'inside', 'channel')
    ).toBe(tree)
    // Ancestor into descendant must not corrupt tree
    expect(
      moveItemInTree(tree, 'f_parent', 'f_child', 'inside', 'channel')
    ).toBe(tree)
    // Non-existent target must roll back without losing item
    expect(
      moveItemInTree(tree, 'f_parent', 'f_nonexistent', 'inside', 'channel')
    ).toBe(tree)
    expect(
      moveItemInTree(tree, 'UC_2', 'f_nonexistent', 'inside', 'channel')
    ).toBe(tree)

    // Valid move into folder succeeds
    const moved = moveItemInTree(tree, 'UC_2', 'f_child', 'inside', 'channel')
    expect(moved.root[0].children[0].children).toEqual(['UC_1', 'UC_2'])
    expect(moved.uncategorized).toEqual([])
  })
})
