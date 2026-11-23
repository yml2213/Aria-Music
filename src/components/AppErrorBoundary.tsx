import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Aria Music render failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-crash">
        <span>
          <TriangleAlert />
        </span>
        <h1>页面加载失败</h1>
        <p>本地音乐库或播放状态出现异常，刷新后可以重试。</p>
        <button className="primary-button" type="button" onClick={() => location.reload()}>
          <RefreshCw />
          刷新页面
        </button>
      </main>
    );
  }
}
