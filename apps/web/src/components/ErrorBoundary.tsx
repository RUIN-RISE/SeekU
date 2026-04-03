"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#fafafa] px-4">
          <div className="max-w-md w-full text-center">
            <div className="text-6xl mb-6">😵</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">
              出了点问题
            </h1>
            <p className="text-slate-500 mb-8">
              页面遇到了一个错误，请尝试刷新或返回首页。
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                重试
              </button>
              <a
                href="/"
                className="px-5 py-2.5 bg-white text-slate-700 rounded-lg font-medium border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                返回首页
              </a>
            </div>
            {this.state.error && (
              <div className="mt-6">
                <button
                  onClick={this.toggleDetails}
                  className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {this.state.showDetails ? "隐藏详情" : "查看详情"}
                </button>
                {this.state.showDetails && (
                  <pre className="mt-3 text-left text-xs text-red-600 bg-red-50 p-4 rounded-lg overflow-auto max-h-48">
                    {this.state.error.message}
                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
