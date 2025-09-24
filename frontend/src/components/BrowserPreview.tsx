import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface BrowserPreviewProps {
  url: string;
  isRunning: boolean;
  className?: string;
}

const BrowserPreview: React.FC<BrowserPreviewProps> = ({
  url,
  isRunning,
  className = ''
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Refresh iframe when URL changes or test starts
  useEffect(() => {
    if (url) {
      setIsLoading(true);
      setError(null);
      setIframeKey(prev => prev + 1);
    }
  }, [url, isRunning]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load the website. This may be due to CORS restrictions or the site blocking iframe embedding.');
  };

  const refreshPreview = () => {
    setIsLoading(true);
    setError(null);
    setIframeKey(prev => prev + 1);
  };

  // Check if URL is valid
  const isValidUrl = url && (url.startsWith('http://') || url.startsWith('https://'));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`card ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-secondary-900">Browser Preview</h3>
          <p className="text-sm text-secondary-600">Live view of the tested website</p>
        </div>
        <div className="flex items-center space-x-2">
          {isRunning && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-green-600 font-medium">Testing</span>
            </div>
          )}
          <button
            onClick={refreshPreview}
            className="p-2 rounded-md bg-secondary-100 hover:bg-secondary-200 transition-colors"
            title="Refresh preview"
          >
            🔄
          </button>
        </div>
      </div>

      <div className="relative bg-white border border-secondary-200 rounded-lg overflow-hidden">
        {/* Browser-like address bar */}
        <div className="bg-secondary-50 border-b border-secondary-200 px-4 py-2 flex items-center space-x-2">
          <div className="flex space-x-1">
            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
            <div className="w-3 h-3 bg-green-400 rounded-full"></div>
          </div>
          <div className="flex-1 bg-white border border-secondary-200 rounded px-3 py-1 text-sm text-secondary-700 font-mono">
            {url || 'No URL specified'}
          </div>
        </div>

        {/* Preview content */}
        <div className="relative" style={{ height: '400px' }}>
          {!isValidUrl ? (
            <div className="flex items-center justify-center h-full bg-secondary-50">
              <div className="text-center">
                <div className="text-secondary-400 text-4xl mb-4">🌐</div>
                <p className="text-secondary-600">Enter a valid URL to preview the website</p>
                <p className="text-sm text-secondary-500 mt-2">URL should start with http:// or https://</p>
              </div>
            </div>
          ) : (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                    <p className="text-secondary-600 text-sm">Loading preview...</p>
                  </div>
                </div>
              )}

              {error ? (
                <div className="absolute inset-0 flex items-center justify-center bg-secondary-50 z-10">
                  <div className="text-center max-w-md px-4">
                    <div className="text-orange-500 text-4xl mb-4">⚠️</div>
                    <p className="text-secondary-700 mb-2">Preview Unavailable</p>
                    <p className="text-sm text-secondary-600 mb-4">{error}</p>
                    <button
                      onClick={refreshPreview}
                      className="btn btn-sm btn-outline"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <iframe
                  key={iframeKey}
                  src={url}
                  className="w-full h-full border-0"
                  title="Website Preview"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              )}
            </>
          )}
        </div>

        {/* Footer with info */}
        <div className="bg-secondary-50 border-t border-secondary-200 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-secondary-600">
            <span>
              {isValidUrl ? 'Embedded preview' : 'Invalid URL'}
            </span>
            {isValidUrl && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 underline"
              >
                Open in new tab ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default BrowserPreview;