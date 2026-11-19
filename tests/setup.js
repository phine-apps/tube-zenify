import '@testing-library/jest-dom/vitest'

// Provide a reliable in-memory localStorage for Node 22+/25+ jsdom environments
const storageMap = new Map()
const memoryStorage = {
  getItem: (key) =>
    storageMap.has(String(key)) ? storageMap.get(String(key)) : null,
  setItem: (key, value) => storageMap.set(String(key), String(value)),
  removeItem: (key) => storageMap.delete(String(key)),
  clear: () => storageMap.clear(),
  key: (index) => Array.from(storageMap.keys())[index] ?? null,
  get length() {
    return storageMap.size
  },
}
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
})
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  })
}

global.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  i18n: {
    getMessage: vi.fn((key) => key),
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(() => Promise.resolve()),
    lastError: null,
  },
  sidePanel: {
    setPanelBehavior: vi.fn(() => Promise.resolve()),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    reload: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
}
