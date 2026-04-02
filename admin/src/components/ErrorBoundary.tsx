import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={{ padding: '2rem', maxWidth: '600px', margin: '4rem auto', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          An unexpected error occurred. Please try reloading the page.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Reload Page
          </button>
          <button
            onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'transparent',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            {this.state.showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
        {this.state.showDetails && this.state.error && (
          <pre style={{
            padding: '1rem',
            backgroundColor: '#f8f8f8',
            borderRadius: '0.375rem',
            overflow: 'auto',
            fontSize: '0.75rem',
            color: '#991b1b',
            border: '1px solid #e5e7eb',
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
