import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface WebSocketMessage {
    type: string;
    data: any;
}

export const useWebSocket = () => {
    const { token, user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

    const connect = useCallback(() => {
        if (!token || !user) return;
        
        // Close existing connection
        if (wsRef.current) {
            wsRef.current.close();
        }

        // Determine protocol (ws or wss)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // In dev, vite proxy handles /api, but usually WS needs explicit port or proxy config.
        // Assuming backend is on 8080 (based on setup) or via proxy.
        // If via proxy: ws://localhost:5173/ws/notifications?token=...
        // Vite proxy configuration needs to support WS.
        // Let's assume standard Vite proxy for /ws is configured or we hit backend directly.
        // If backend is 8080: ws://localhost:8080/ws/notifications
        
        // Let's try relative path if proxy is set up, otherwise hardcode for dev
        const wsUrl = `ws://localhost:8080/ws/notifications?token=${token}`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket Connected');
            setIsConnected(true);
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
                    // Trigger a custom event for other components to reload notices
                    window.dispatchEvent(new CustomEvent('sys-notice-received'));
                }
            } catch (e) {
                console.error('WS Message Parse Error', e);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket Disconnected');
            setIsConnected(false);
            // Reconnect after 5s
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, 5000);
        };

        ws.onerror = (err) => {
            console.error('WebSocket Error', err);
            ws.close();
        };

        wsRef.current = ws;
    }, [token, user]);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [connect]);

    return { isConnected };
};
