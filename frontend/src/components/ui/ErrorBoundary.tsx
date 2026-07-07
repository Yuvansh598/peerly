import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in Peerly:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#070913] text-white p-6 font-sans">
          <div className="glass p-8 rounded-3xl max-w-md text-center border border-white/10 glass-glow flex flex-col items-center">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-[#ff4d6d] mb-4">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Peerly encountered an unexpected error. Don't worry, all connection states were safely terminated.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[#00f0ff] hover:bg-[#33f3ff] text-black font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(0,240,255,0.3)] active:scale-95 cursor-pointer"
            >
              Reload Platform
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
