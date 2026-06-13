import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { getAuthToken } from '@/utils/authStorage';
import { buildHttpUrl, buildWebSocketUrl, loadDesktopRuntimeConfig } from '@/services/desktopConfig';

interface WebSocketMessage {
    type: string;
    topic?: string;
    payload?: unknown;
    data: any;
}

const topicHandlers = new Map<string, (payload: unknown) => void>();

export function subscribeWsTopic(topic: string, handler: (payload: unknown) => void) {
    topicHandlers.set(topic, handler);
}

export function unsubscribeWsTopic(topic: string) {
    topicHandlers.delete(topic);
}

export function resetWsTopicHandlers() {
    topicHandlers.clear();
}

/**
 * WebSocket 连接 Hook
 * 用于接收服务端实时通知推送
 *
 * 连接策略：
 * 1. 先通过 HTTP 探测后端网关是否可达，避免盲目建立 WebSocket
 * 2. 只有曾经成功连接过，断开后才会重连
 * 3. 首次连接就失败时，静默降级，不重连不刷屏
 * 4. 页面重新可见时自动尝试恢复
 */
export const useWebSocket = () => {
    const { user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // 重连计数器
    const reconnectCountRef = useRef(0);
    // 是否曾经成功连接过（只有成功过才会重连）
    const hasConnectedRef = useRef(false);
    // 标记组件是否已卸载
    const unmountedRef = useRef(false);
    // 首帧鉴权是否已通过（收到 AUTH_OK 之前业务消息不应被信任）
    const authOkRef = useRef(false);

    const MAX_RECONNECT_ATTEMPTS = 5;

    /**
     * 探测后端是否可达
     * 使用网关白名单路径（/auth/login），避免被 AuthFilter 拦截返回 401
     */
    const isBackendAvailable = useCallback(async (): Promise<boolean> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const runtimeConfig = await loadDesktopRuntimeConfig();
            // 使用 OPTIONS 请求探测白名单路径，不会触发 401
            await fetch(buildHttpUrl(runtimeConfig.apiBaseUrl, '/auth/login'), {
                method: 'OPTIONS',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            // 任何 HTTP 响应（包括 404/405）都说明后端可达
            return true;
        } catch {
            // 网络错误或超时，后端不可达
            return false;
        }
    }, []);

    const connect = useCallback(async () => {
        // 组件已卸载，不连接
        if (unmountedRef.current) return;

        const token = getAuthToken();
        if (!token || !user) return;

        // 关闭已有连接
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.onmessage = null;
            wsRef.current.onopen = null;
            if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
                wsRef.current.close();
            }
            wsRef.current = null;
        }

        const runtimeConfig = await loadDesktopRuntimeConfig();

        // 如果从未成功连接过，先探测后端是否可达
        if (!hasConnectedRef.current) {
            const available = await isBackendAvailable();
            if (!available) {
                // 后端不可达，静默降级，不建立 WebSocket
                console.debug('WebSocket: 后端服务不可达，跳过连接');
                return;
            }
        }

        // 组件可能在 await 期间卸载
        if (unmountedRef.current) return;

        // P3-6：token 不再随 URL 传输（避免进入 access log / 浏览器历史），改由首帧 AUTH 消息发送
        const wsUrl = buildWebSocketUrl(runtimeConfig, '/ws/notifications');

        const ws = new WebSocket(wsUrl);
        authOkRef.current = false;

        ws.onopen = () => {
            if (unmountedRef.current) {
                ws.close();
                return;
            }
            // 握手完成后立即发送鉴权首帧
            try {
                ws.send(JSON.stringify({ type: 'AUTH', token }));
            } catch (e) {
                console.warn('WebSocket: 发送 AUTH 帧失败', e);
            }
        };

        ws.onmessage = (event) => {
            try {
                const msg: WebSocketMessage = JSON.parse(event.data);
                // 鉴权状态机：先吃 AUTH_OK / AUTH_FAIL
                if (msg.type === 'AUTH_OK') {
                    authOkRef.current = true;
                    setIsConnected(true);
                    hasConnectedRef.current = true;
                    reconnectCountRef.current = 0;
                    console.log('WebSocket: 鉴权成功');
                    return;
                }
                if (msg.type === 'AUTH_FAIL') {
                    console.warn('WebSocket: 鉴权失败');
                    authOkRef.current = false;
                    // 鉴权失败视同首次连接失败，避免无限重连
                    hasConnectedRef.current = false;
                    return;
                }
                // 未鉴权前不信任任何业务消息
                if (!authOkRef.current) return;

                if (msg.topic && topicHandlers.has(msg.topic)) {
                    topicHandlers.get(msg.topic)!(msg.payload);
                } else if (msg.type === 'NOTICE') {
                    const notice = msg.data;
                    toast.info(notice.noticeTitle, {
                        description: notice.noticeContent,
                        action: {
                            label: '查看',
                            onClick: () => console.log('View notice', notice.noticeId)
                        }
                    });
                    window.dispatchEvent(new CustomEvent('sys-notice-received'));
                }
            } catch (e) {
                console.error('WebSocket: 消息解析失败', e);
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
            authOkRef.current = false;

            // 组件已卸载，不重连
            if (unmountedRef.current) return;

            // 从未成功连接过 → 后端可能不支持 WebSocket 或认证失败，静默放弃
            if (!hasConnectedRef.current) {
                console.debug('WebSocket: 首次连接失败，静默降级');
                return;
            }

            // 曾经成功连接过，现在断开了 → 指数退避重连
            if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(10000 * Math.pow(2, reconnectCountRef.current), 60000);
                reconnectCountRef.current += 1;
                console.log(`WebSocket: 断开，${delay / 1000}s 后第 ${reconnectCountRef.current} 次重连...`);
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, delay);
            } else {
                console.warn('WebSocket: 重连次数已达上限，停止重连');
            }
        };

        ws.onerror = () => {
            // 静默处理，onclose 会处理后续逻辑
        };

        wsRef.current = ws;
    }, [user, isBackendAvailable]);

    // 页面可见性变化时，尝试恢复连接
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !isConnected && user && !unmountedRef.current) {
                reconnectCountRef.current = 0;
                connect();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isConnected, user, connect]);

    useEffect(() => {
        unmountedRef.current = false;
        connect();

        return () => {
            unmountedRef.current = true;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.onmessage = null;
                wsRef.current.onopen = null;
                if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
                    wsRef.current.close();
                }
                wsRef.current = null;
            }
        };
    }, [connect]);

    return { isConnected };
};
