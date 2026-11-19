import { describe, it, expect } from 'vitest'
import { validateFolderStructure } from '../src/sidepanel/hooks/useFolderStructure'

describe('validateFolderStructure', () => {
  it('accepts valid channel and playlist structures', () => {
    expect(() =>
      validateFolderStructure({
        root: [
          {
            id: 'f_1',
            type: 'folder',
            name: 'Favorites',
            children: [
              { id: 'UC123', type: 'channel' },
              { id: 'PL456', type: 'playlist' },
              'UC789',
            ],
          },
        ],
        uncategorized: [{ id: 'PL999', type: 'playlist' }],
      })
    ).not.toThrow()
  })

  it('rejects unknown node types and missing root', () => {
    expect(() => validateFolderStructure({})).toThrow()
    expect(() =>
      validateFolderStructure({
        root: [{ id: 'x', type: 'unknown' }],
      })
    ).toThrow(/Invalid node type/)
  })
})
