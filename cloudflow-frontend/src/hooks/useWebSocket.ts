import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { getAuthToken } from '@/utils/authStorage';

interface WebSocketMessage {
    type: string;
    data: any;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
const wsBasePath = import.meta.env.VITE_WS_BASE_PATH || '/ws';

const joinPath = (base: string, path: string) => `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

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

    const MAX_RECONNECT_ATTEMPTS = 5;

    /**
     * 探测后端是否可达
     * 使用网关白名单路径（/auth/login），避免被 AuthFilter 拦截返回 401
     */
    const isBackendAvailable = useCallback(async (): Promise<boolean> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            // 使用 OPTIONS 请求探测白名单路径，不会触发 401
            await fetch(joinPath(apiBaseUrl, '/auth/login'), {
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

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}${joinPath(wsBasePath, '/notifications')}?token=${token}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            if (unmountedRef.current) {
                ws.close();
                return;
            }
            console.log('WebSocket: 连接成功');
            setIsConnected(true);
            hasConnectedRef.current = true;
            reconnectCountRef.current = 0;
        };

        ws.onmessage = (event) => {
            try {
                const msg: WebSocketMessage = JSON.parse(event.data);
                if (msg.type === 'NOTICE') {
                    const notice = msg.data;
                    toast.info(notice.noticeTitle, {
                        description: notice.noticeContent,
                        action: {
                            label: '查看',
                            onClick: () => console.log('View notice', notice.noticeId)
                        }
                    });
                    // 触发自定义事件，通知其他组件刷新通知列表
                    window.dispatchEvent(new CustomEvent('sys-notice-received'));
                }
            } catch (e) {
                console.error('WebSocket: 消息解析失败', e);
            }
        };

        ws.onclose = () => {
            setIsConnected(false);

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
