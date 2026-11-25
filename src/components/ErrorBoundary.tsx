import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMessage = 'Something went wrong while loading your workspace.';
      if (this.state.errorMessage.includes('Quota exceeded')) {
        friendlyMessage =
          'Daily Firestore read quota was reached. Please try again tomorrow or upgrade your Firebase plan.';
      } else if (this.state.errorMessage.includes('Missing or insufficient permissions')) {
        friendlyMessage =
          'Access was restricted by security rules. Please ensure you are signed in with a verified account.';
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Unable to complete request</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{friendlyMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
