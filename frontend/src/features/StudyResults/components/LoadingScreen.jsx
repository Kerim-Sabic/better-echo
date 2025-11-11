import React from "react";

/**
 * Handles all visual feedback for query state.
 * Accepts a `state` ("loading" | "pending" | "ready" | "not_found" | "error").
 */
export default function LoadingScreen({ state }) {
  if (state === "loading") {
    return <div className="text-sm text-gray-600">Loading data…</div>;
  }

  if (state === "pending") {
    return <div className="text-sm text-gray-600">Model inference running…</div>;
  }

  if (state === "not_found") {
    return <div className="text-sm text-gray-600">No results found for this study.</div>;
  }

  if (state === "error") {
    return <div className="text-sm text-red-600">Something went wrong.</div>;
  }

  // If state is "ready", render nothing (parent will render the main content)
  return null;
}