import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import './common-primitives.css';

export interface NavigationRouter {
  state: { navigation: { state: string } };
  subscribe: (listener: () => void) => () => void;
}

export interface NavigationProgressProps {
  router: NavigationRouter;
  delay?: number;
}

export const NavigationProgress: React.FC<NavigationProgressProps> = ({ router, delay = 150 }) => {
  const navigationState = useSyncExternalStore(
    (listener) => router.subscribe(listener),
    () => router.state.navigation.state,
    () => 'idle',
  );
  const [visible, setVisible] = useState(false);
  const [percent, setPercent] = useState(0);
  const visibleRef = useRef(false);
  const showTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const clearTimer = (timerRef: React.MutableRefObject<number | null>) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const clearProgressTimer = () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
    const startProgressTimer = () => {
      clearProgressTimer();
      progressTimerRef.current = window.setInterval(() => {
        setPercent((current) => {
          const remaining = 90 - current;
          return remaining <= 0.5 ? current : current + Math.max(remaining * 0.12, 0.5);
        });
      }, 120);
    };

    if (navigationState !== 'idle') {
      clearTimer(hideTimerRef);
      if (visibleRef.current) {
        setPercent((current) => Math.max(current, 8));
        startProgressTimer();
      } else {
        clearTimer(showTimerRef);
        showTimerRef.current = window.setTimeout(() => {
          setPercent(8);
          setVisible(true);
          visibleRef.current = true;
          startProgressTimer();
        }, delay);
      }
    } else {
      clearTimer(showTimerRef);
      clearProgressTimer();
      if (visibleRef.current) {
        setPercent(100);
        clearTimer(hideTimerRef);
        hideTimerRef.current = window.setTimeout(() => {
          setVisible(false);
          visibleRef.current = false;
          setPercent(0);
        }, 220);
      }
    }

    return () => {
      clearTimer(showTimerRef);
      clearProgressTimer();
    };
  }, [delay, navigationState]);

  useEffect(() => () => {
    [showTimerRef, progressTimerRef, hideTimerRef].forEach((timerRef) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    });
  }, []);

  return (
    <div
      className={`cf-navigation-progress${visible ? ' is-visible' : ''}`}
      role="progressbar"
      aria-label="页面加载进度"
      aria-hidden={!visible}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div className="cf-navigation-progress-bar" style={{ width: `${percent}%` }} />
    </div>
  );
};

