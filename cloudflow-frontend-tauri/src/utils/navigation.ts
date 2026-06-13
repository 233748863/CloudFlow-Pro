/**
 * 非 React 上下文中的导航工具（P2-1 改造）
 *
 * axios 拦截器、WebSocket 错误回调等非 React 代码无法直接使用 useNavigate hook。
 * 通过 App 启动时调用 setNavigator 注入路由器的 navigate 函数，
 * 这些上下文即可调用 navigateTo 完成 SPA 软跳转（不触发 window.location.href 全页刷新）。
 */
export interface NavigateOptions {
  replace?: boolean;
}

type NavigatorFn = (to: string, opts?: NavigateOptions) => void;

let navigatorFn: NavigatorFn | null = null;

export const setNavigator = (fn: NavigatorFn): void => {
  navigatorFn = fn;
};

export const navigateTo = (to: string, opts?: NavigateOptions): void => {
  if (navigatorFn) {
    navigatorFn(to, opts);
    return;
  }
  // 兜底：router 尚未就绪时退化为硬跳转
  window.location.href = to;
};
