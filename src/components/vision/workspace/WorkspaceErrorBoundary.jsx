/**
 * WorkspaceErrorBoundary — a failing workspace must not take Vision Home down.
 *
 * The technical error goes to the console; the surface says something a person
 * can act on (Part 23).
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';

export default class WorkspaceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[VisionWorkspace] surface failed:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // A different workspace is a different surface — give it a clean try.
    if (prevProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="h-5 w-5 text-vision-champagne/70" />
        <p className="mt-4 text-[14px] text-white/65">
          Vision couldn't open this workspace.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="mt-5 rounded-full border border-white/15 px-5 py-2 text-[12.5px] text-white/75 transition-colors hover:border-vision-gold/45 hover:text-white vision-focus"
        >
          Try again
        </button>
      </div>
    );
  }
}