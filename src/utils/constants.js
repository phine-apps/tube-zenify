export const STORAGE_KEYS = {
  FOLDERS: 'zen_folders', // Legacy
  FOLDERS_V2: 'zen_folders_v2', // Sharded chunks
  FOLDERS_META: 'zen_folders_meta', // Sharding metadata
  CHANNELS: 'zen_channels',
  PLAYLIST_FOLDERS: 'zen_playlist_folders', // Legacy / fallback
  PLAYLIST_FOLDERS_V2: 'zen_playlist_folders_v2', // Sharded chunks
  PLAYLIST_FOLDERS_META: 'zen_playlist_folders_meta', // Sharding metadata
  PLAYLISTS: 'zen_playlists',
  LAST_SYNC: 'zen_last_sync',
}

export const SYSTEM_PLAYLIST_IDS = new Set(['WL', 'LL', 'HL', 'LM'])

export const SYNC_LIMIT = 100 * 1024 // 100KB total limit for sync storage
export const MAX_CHUNK_SIZE = 7000 // Safely under 8KB limit per item
