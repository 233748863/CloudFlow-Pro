import { useEffect, useRef } from 'react';

/**
 * A hook that runs the callback only once when the component mounts.
 * This is useful for preventing duplicate API calls in React Strict Mode.
 */
export const useMount = (callback: () => void | Promise<void>) => {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      callback();
    }
  }, []);
};
