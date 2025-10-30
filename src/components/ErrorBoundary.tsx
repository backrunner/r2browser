import { Component, ErrorInfo, ReactNode } from 'react'
import { Icons } from './ui/icons'
import { Button } from './ui/button'
import { relaunch, exit } from '@tauri-apps/plugin-process'
import { logError } from '@/lib/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    logError(error, 'ErrorBoundary caught an error', 'error-boundary')

    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleRelaunch = async () => {
    try {
      await relaunch()
    } catch (error) {
      // If Tauri relaunch fails, fallback to page reload
      logError(error, 'Failed to relaunch app', 'error-boundary')
      window.location.reload()
    }
  }

  handleExit = async () => {
    try {
      await exit(1)
    } catch (error) {
      // If Tauri exit fails, close the window
      logError(error, 'Failed to exit app', 'error-boundary')
      window.close()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-background p-8">
          <div className="max-w-2xl w-full space-y-6 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-6">
                <Icons.error className="h-16 w-16 text-destructive" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Something went wrong</h1>
              <p className="text-muted-foreground text-lg">
                The application encountered an unexpected error. You can try to continue or restart the application.
              </p>
            </div>

            {this.state.error && (
              <details className="text-left bg-muted/50 rounded-lg p-4 max-h-60 overflow-auto">
                <summary className="cursor-pointer font-semibold text-sm mb-2 select-none">
                  Error Details
                </summary>
                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <strong className="text-destructive">Error:</strong>
                    <pre className="mt-1 whitespace-pre-wrap break-words">
                      {this.state.error.toString()}
                    </pre>
                  </div>
                  {this.state.error.stack && (
                    <div>
                      <strong className="text-muted-foreground">Stack Trace:</strong>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <strong className="text-muted-foreground">Component Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex gap-3 justify-center pt-4">
              <Button
                onClick={this.handleReset}
                variant="default"
                size="lg"
                className="min-w-32"
              >
                <Icons.refresh className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button
                onClick={this.handleRelaunch}
                variant="outline"
                size="lg"
                className="min-w-32"
              >
                <Icons.refresh className="h-4 w-4 mr-2" />
                Restart App
              </Button>
              <Button
                onClick={this.handleExit}
                variant="ghost"
                size="lg"
                className="min-w-32"
              >
                <Icons.x className="h-4 w-4 mr-2" />
                Exit
              </Button>
            </div>

            <p className="text-xs text-muted-foreground pt-4">
              If the problem persists, please report it on{' '}
              <a
                href="https://github.com/backrunner/r2browser/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub
              </a>
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
