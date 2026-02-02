import React, { useState, useRef } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { ZenProvider } from './context/ZenContext'
import { useZen } from './context/useZen'
import FolderTree from './components/FolderTree'
import SearchBar from './components/SearchBar'
import ErrorBoundary from './components/ErrorBoundary'
import {
  FolderPlus,
  Settings,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  X,
  Loader2,
  Info,
} from 'lucide-react'
import logo from '../assets/icon-48.png'
import Modal from './components/Modal'

const MainLayout = () => {
  const {
    errorMsg,
    createFolder,
    exportSettings,
    importSettings,
    storageWarning,
    setStorageWarning,
    selectFolder,
    isConnecting,
    isLoaded,
    isMigrating,
    isLoginRequired,
    retryConnection,
    openYouTube,
    reloadWithClear,
    isCloudSyncActive,
  } = useZen()
  const [showSettings, setShowSettings] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAboutModal, setShowAboutModal] = useState(false)
  const fileInputRef = useRef(null)

  return (
    <div
      className="h-screen w-full bg-zen-bg flex flex-col font-sans text-zen-text selection:bg-zen-accent/20"
      onClick={() => selectFolder(null)}
    >
      {/* Header */}
      <header className="px-5 py-4 bg-zen-surface/80 backdrop-blur-md border-b border-zen-border flex items-center justify-between sticky top-0 z-40 transition-shadow duration-300">
        <h1 className="text-lg font-bold text-gray-800 tracking-tight flex items-center gap-2.5">
          <img src={logo} alt="Logo" className="w-6 h-6 object-contain" />
          <span className="text-zen-text">TubeZenify</span>
        </h1>
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowCreateModal(true)
            }}
            className="p-2 text-zen-muted hover:text-zen-accent hover:bg-purple-50 rounded-full transition-colors duration-200"
            title={chrome.i18n.getMessage('folderNew') || 'New Folder'}
          >
            <FolderPlus size={18} />
          </button>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowSettings(!showSettings)
              }}
              className="p-2 text-zen-muted hover:text-zen-accent hover:bg-zen-surface rounded-full transition-colors duration-200"
              title={chrome.i18n.getMessage('menuSettings') || 'Settings'}
            >
              <Settings size={18} />
            </button>

            {/* Dropdown Menu */}
            {showSettings && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowSettings(false)
                  }}
                ></div>
                <div
                  className="absolute right-0 top-full mt-2 w-56 bg-zen-surface rounded-xl shadow-lg border border-zen-border py-2 z-20 flex flex-col overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-1.5 text-[10px] font-bold text-zen-muted uppercase tracking-wider">
                    {chrome.i18n.getMessage('labelMaintenance') ||
                      'Maintenance'}
                  </div>
                  <button
                    onClick={() => {
                      reloadWithClear()
                      setShowSettings(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-zen-text hover:bg-zen-bg hover:text-zen-accent transition-colors w-full text-left"
                  >
                    <RefreshCw size={14} />
                    <span>{chrome.i18n.getMessage('menuReload')}</span>
                  </button>

                  <div className="h-px bg-zen-border my-1 mx-2"></div>

                  <div className="px-4 py-1.5 text-[10px] font-bold text-zen-muted uppercase tracking-wider">
                    {chrome.i18n.getMessage('labelLocalBackup') ||
                      'Local Backup'}
                  </div>
                  <button
                    onClick={() => {
                      exportSettings()
                      setShowSettings(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-zen-text hover:bg-zen-bg hover:text-zen-accent transition-colors w-full text-left"
                  >
                    <Download size={14} />
                    <span>{chrome.i18n.getMessage('menuExport')}</span>
                  </button>
                  <button
                    onClick={() => {
                      fileInputRef.current?.click()
                      setShowSettings(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-zen-text hover:bg-zen-bg hover:text-zen-accent transition-colors w-full text-left"
                  >
                    <Upload size={14} />
                    <span>{chrome.i18n.getMessage('menuImport')}</span>
                  </button>

                  <div className="h-px bg-zen-border my-1 mx-2"></div>

                  <div className="px-4 py-1.5 text-[10px] font-bold text-zen-muted uppercase tracking-wider">
                    {chrome.i18n.getMessage('labelInfo') || 'Info'}
                  </div>
                  <div className="px-4 py-1.5">
                    {isCloudSyncActive ? (
                      <div className="flex items-center gap-2 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1.5 rounded-lg border border-green-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        {chrome.i18n.getMessage('syncEnabled') ||
                          'Cloud Sync Active'}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                        {chrome.i18n.getMessage('syncDisabled') ||
                          'Local Storage Only'}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setShowAboutModal(true)
                      setShowSettings(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-zen-text hover:bg-zen-bg hover:text-zen-accent transition-colors w-full text-left"
                  >
                    <Info size={14} />
                    <span>
                      {chrome.i18n.getMessage('menuAbout') || 'About'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = (event) => {
                importSettings(event.target.result)
              }
              reader.readAsText(file)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      {errorMsg && (
        <div
          className={`border-b px-4 py-4 text-sm flex flex-col items-center justify-center gap-3 text-center animate-fade-in ${
            isLoginRequired
              ? 'bg-amber-50 border-amber-100 text-amber-900'
              : 'bg-blue-50 border-blue-100 text-blue-900'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2.5">
            {isConnecting ? (
              <Loader2 size={18} className="animate-spin text-blue-600" />
            ) : isLoginRequired ? (
              <AlertTriangle size={18} className="text-amber-600" />
            ) : (
              <RefreshCw size={18} className="text-blue-600" />
            )}
            <span className="font-semibold leading-tight">{errorMsg}</span>
          </div>

          {!isConnecting && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={retryConnection}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${
                  isLoginRequired
                    ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'
                    : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                }`}
              >
                <RefreshCw size={12} />
                {chrome.i18n.getMessage('actionRetry')}
              </button>

              <button
                onClick={openYouTube}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
              >
                <Download size={12} className="rotate-180" />
                {chrome.i18n.getMessage('actionOpenYouTube')}
              </button>
            </div>
          )}
        </div>
      )}

      {storageWarning && (
        <div
          className={`border-b px-4 py-2.5 text-xs flex items-center justify-between gap-2 ${
            storageWarning.error
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 flex-1">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="flex-1">
              {storageWarning.error ? (
                <span>{storageWarning.message}</span>
              ) : (
                <span>
                  {chrome.i18n.getMessage('storageUsageInfo', [
                    storageWarning.percentage.toString(),
                    (storageWarning.size / 1024).toFixed(1) + 'KB',
                    storageWarning.limit / 1024 + 'KB',
                  ])}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => setStorageWarning(null)}
            className="p-0.5 hover:bg-black/10 rounded transition-colors flex-shrink-0"
            title={chrome.i18n.getMessage('dismiss') || 'Dismiss'}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-4 py-4 min-h-0">
        <SearchBar />
        <FolderTree />
      </main>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onConfirm={(name) => createFolder(name)}
        title={chrome.i18n.getMessage('folderNew') || 'New Folder'}
        placeholder={
          chrome.i18n.getMessage('promptNewFolderName') ||
          'Enter folder name...'
        }
        confirmLabel={chrome.i18n.getMessage('create') || 'Create'}
      />

      {/* About Modal */}
      <Modal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        title={chrome.i18n.getMessage('aboutTitle') || 'About TubeZenify'}
        confirmLabel={null} // No confirm button
      >
        <div className="space-y-3 text-sm text-zen-text leading-relaxed p-1">
          <p>
            {chrome.i18n.getMessage('aboutDisclaimer') ||
              'TubeZenify is an unofficial extension and is not affiliated with YouTube™.'}
          </p>
          <p>
            {chrome.i18n.getMessage('aboutWarranty') ||
              'Features may change or break due to YouTube updates.'}
          </p>
          <p className="font-medium text-zen-accent">
            {chrome.i18n.getMessage('aboutPrivacy') ||
              'All data is processed on your device and via your personal Google account storage.'}
          </p>
        </div>
      </Modal>

      {(!isLoaded || isMigrating) && (
        <div className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <Loader2 size={32} className="animate-spin text-zen-accent" />
          <p className="text-sm font-medium text-zen-text italic">
            {isMigrating
              ? chrome.i18n.getMessage('statusMigrating') ||
                'Migrating your data...'
              : chrome.i18n.getMessage('statusLoading') ||
                'Loading your space...'}
          </p>
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <React.StrictMode>
      <ZenProvider>
        <ErrorBoundary>
          <DndProvider backend={HTML5Backend}>
            <MainLayout />
          </DndProvider>
        </ErrorBoundary>
      </ZenProvider>
    </React.StrictMode>
  )
}

export default App
