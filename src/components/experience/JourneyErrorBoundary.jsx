import React from 'react';

export default class JourneyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[JourneyErrorBoundary] Caught error:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-8 gap-6">
          <p className="text-white/50 text-sm font-light tracking-wide max-w-sm">
            I need a moment to load this section. Please refresh or continue.
          </p>
          <p className="text-white/20 text-xs font-mono max-w-md break-all">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-6 py-2.5 rounded-lg text-sm font-medium text-black"
            style={{ background: '#D4A853' }}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}