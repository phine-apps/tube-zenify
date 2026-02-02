import React from 'react'
import { AlertTriangle } from 'lucide-react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('TubeZenify Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 flex flex-col items-center justify-center h-screen text-center bg-zen-bg">
          <AlertTriangle className="w-12 h-12 text-zen-live mb-4 animate-bounce" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">
            {chrome.i18n.getMessage('errorBoundaryTitle') ||
              'Something went wrong'}
          </h2>
          <p className="text-sm text-zen-muted mb-4 max-w-xs">
            {chrome.i18n.getMessage('errorBoundaryDescription') ||
              'Refreshed data might be needed. Please reload the extension.'}
          </p>
          <div className="bg-gray-100 p-2 rounded text-xs text-left w-full overflow-auto max-h-32 font-mono text-gray-600">
            {this.state.error?.toString()}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-zen-primary text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm"
          >
            {chrome.i18n.getMessage('errorBoundaryReload') ||
              'Reload Extension'}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
