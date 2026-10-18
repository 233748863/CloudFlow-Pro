interface PwaUpdateOptions {
  serviceWorker: ServiceWorkerContainer;
  scriptUrl: string;
  onAvailable: (available: boolean) => void;
  onError: () => void;
  reload: () => void;
}

/** 注册离线缓存；只有用户确认更新后才刷新当前页面，保护未保存表单。 */
export function watchPwaUpdates(options: PwaUpdateOptions) {
  const { serviceWorker, scriptUrl, onAvailable, onError, reload } = options;
  let registration: ServiceWorkerRegistration | undefined;
  let installing: ServiceWorker | null = null;
  let announced: ServiceWorker | null = null;
  let disposed = false;
  let applying = false;

  const announce = () => {
    if (disposed || !registration?.waiting || !serviceWorker.controller) return;
    if (announced !== registration.waiting) {
      announced = registration.waiting;
      onAvailable(true);
    }
  };
  const onStateChange = () => {
    if (installing?.state === 'installed') announce();
    if (!disposed && applying && installing?.state === 'redundant') {
      applying = false;
      onError();
    }
  };
  const onUpdateFound = () => {
    installing?.removeEventListener('statechange', onStateChange);
    installing = registration?.installing ?? null;
    installing?.addEventListener('statechange', onStateChange);
  };
  const onControllerChange = () => {
    if (disposed) return;
    onAvailable(false);
    if (applying) {
      applying = false;
      reload();
    }
  };

  serviceWorker.addEventListener('controllerchange', onControllerChange);
  void serviceWorker.register(scriptUrl).then((value) => {
    if (disposed) return;
    registration = value;
    registration.addEventListener('updatefound', onUpdateFound);
    onUpdateFound();
    announce();
  }).catch(() => {
    // 注册失败时保留在线页面，不打断用户操作。
  });

  return {
    applyUpdate() {
      if (disposed || applying) return;
      if (!registration?.waiting) {
        onAvailable(false);
        return;
      }
      applying = true;
      try {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        applying = false;
        onError();
      }
    },
    dispose() {
      disposed = true;
      serviceWorker.removeEventListener('controllerchange', onControllerChange);
      registration?.removeEventListener('updatefound', onUpdateFound);
      installing?.removeEventListener('statechange', onStateChange);
    },
  };
}
