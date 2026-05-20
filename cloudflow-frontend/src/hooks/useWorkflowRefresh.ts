import { useEffect, useRef } from 'react';

const normalize = (v?: string) => (v ? String(v).trim().toLowerCase().replace(/-/g, '_') : '');

export function useWorkflowRefresh(onRefresh: () => void, businessType?: string) {
    const callbackRef = useRef(onRefresh);
    callbackRef.current = onRefresh;

    useEffect(() => {
        const target = normalize(businessType);
        const handler = (e: Event) => {
            const payload = (e as CustomEvent).detail;
            if (!target || normalize(payload?.businessType) === target) {
                callbackRef.current();
            }
        };
        window.addEventListener('workflow-task-completed', handler);
        return () => window.removeEventListener('workflow-task-completed', handler);
    }, [businessType]);
}
