import React from "react";

/**
 * Handles all visual feedback for query state.
 * Accepts a `state` ("loading" | "pending" | "ready" | "not_found" | "error").
 */
export default function LoadingScreen({ state }) {
  if (state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-6">
        <style>{`
          @keyframes heartbeat {
            0% { transform: scale(1); }
            10% { transform: scale(1.15); }
            20% { transform: scale(1); }
            30% { transform: scale(1.15); }
            40% { transform: scale(1); }
            100% { transform: scale(1); }
          }
        `}</style>
        <div className="relative">
          {/* Glassmorphic container with gradient */}
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/20">
            {/* Animated heart with gradient */}
            <svg
              className="w-12 h-12"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                animation: 'heartbeat 1.5s ease-in-out infinite',
                transformOrigin: 'center'
              }}
            >
              <defs>
                <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <animate attributeName="x1" values="0%;100%;0%" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="y1" values="0%;100%;0%" dur="3s" repeatCount="indefinite" />
                  <stop offset="0%" stopColor="#9333EA" />
                  <stop offset="50%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill="url(#heartGradient)"
              />
            </svg>
          </div>
          {/* Animated dots */}
          <div className="flex space-x-1.5 justify-center mt-4">
            <div className="w-2 h-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
            <div className="w-2 h-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></div>
            <div className="w-2 h-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></div>
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-base font-semibold text-gray-800 tracking-tight">Analyzing</p>
          <p className="text-sm text-gray-500 font-medium">AI processing in progress...</p>
        </div>
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-6">
        <style>{`
          @keyframes heartbeat {
            0% { transform: scale(1); }
            10% { transform: scale(1.15); }
            20% { transform: scale(1); }
            30% { transform: scale(1.15); }
            40% { transform: scale(1); }
            100% { transform: scale(1); }
          }
        `}</style>
        <div className="relative">
          {/* Glassmorphic container with gradient */}
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/20">
            {/* Animated heart with gradient */}
            <svg
              className="w-12 h-12"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                animation: 'heartbeat 1.5s ease-in-out infinite',
                transformOrigin: 'center'
              }}
            >
              <defs>
                <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <animate attributeName="x1" values="0%;100%;0%" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="y1" values="0%;100%;0%" dur="3s" repeatCount="indefinite" />
                  <stop offset="0%" stopColor="#9333EA" />
                  <stop offset="50%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill="url(#heartGradient)"
              />
            </svg>
          </div>
          {/* Animated dots */}
          <div className="flex space-x-1.5 justify-center mt-4">
            <div className="w-2 h-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
            <div className="w-2 h-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></div>
            <div className="w-2 h-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></div>
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-base font-semibold text-gray-800 tracking-tight">Analyzing</p>
          <p className="text-sm text-gray-500 font-medium">AI processing in progress...</p>
        </div>
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-6">
        <div className="relative">
          {/* Soft gradient background */}
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center shadow-sm border border-gray-200/50">
            <svg
              className="w-12 h-12 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.5"
              />
              <path
                d="M21 21l-4.35-4.35"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className="text-center space-y-2 max-w-xs">
          <p className="text-base font-semibold text-gray-800 tracking-tight">No Results</p>
          <p className="text-sm text-gray-500 font-medium leading-relaxed">
            No data found for this study
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-6">
        <div className="relative">
          {/* Error state with red gradient */}
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center shadow-sm border border-red-100/50">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center animate-pulse" style={{ animationDuration: '2s' }}>
              <svg
                className="w-8 h-8 text-white"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 9v4m0 4h.01M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
        <div className="text-center space-y-2 max-w-xs">
          <p className="text-base font-semibold text-gray-800 tracking-tight">Unable to Process</p>
          <p className="text-sm text-gray-500 font-medium leading-relaxed">
            An error occurred. Please try again
          </p>
        </div>
      </div>
    );
  }

  // If state is "ready", render nothing (parent will render the main content)
  return null;
}