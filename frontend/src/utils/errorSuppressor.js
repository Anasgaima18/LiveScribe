/**
 * Error Suppressor Utility
 * Filters out non-critical LiveKit internal errors from the console
 */

const SUPPRESSED_ERROR_PATTERNS = [
  'Element not part of the array',
  'placeholder not in',
  '_camera_placeholder',
  'updatePages()',
  'Error while running updatePages()',
  'peerconnection failed disconnected',
  'resuming signal connection',
  'Resuming signal connection',
  'Resumed signal connection',
  'publishing track',
  'disconnect from room',
  'leave-reconnect disconnected',
  'already attempting reconnect',
  'WebSocket is already in CLOSING or CLOSED state',
  'reconnect disconnected',
  'reconnecting, attempt:',
];

/**
 * Check if an error should be suppressed
 */
export const shouldSuppressError = (error) => {
  const errorMessage = error?.message || String(error);
  
  return SUPPRESSED_ERROR_PATTERNS.some(pattern => 
    errorMessage.includes(pattern)
  );
};

/**
 * Install error suppressor for console.error
 * This intercepts console.error calls and filters out known non-critical errors
 */
export const installErrorSuppressor = () => {
  const originalConsoleError = console.error;
  
  console.error = (...args) => {
    // Check if any of the arguments match suppressed patterns
    const shouldSuppress = args.some(arg => {
      if (typeof arg === 'string') {
        return SUPPRESSED_ERROR_PATTERNS.some(pattern => arg.includes(pattern));
      }
      if (arg instanceof Error) {
        return shouldSuppressError(arg);
      }
      return false;
    });
    
    // If not suppressed, call original console.error
    if (!shouldSuppress) {
      originalConsoleError.apply(console, args);
    }
  };
  
  // Return cleanup function
  return () => {
    console.error = originalConsoleError;
  };
};

/**
 * Install window error event handler
 * Prevents LiveKit internal errors from bubbling up
 */
export const installWindowErrorHandler = () => {
  const handler = (event) => {
    if (event.error && shouldSuppressError(event.error)) {
      event.preventDefault();
      return true;
    }
  };
  
  window.addEventListener('error', handler);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('error', handler);
  };
};

/**
 * Install unhandled rejection handler
 * Catches promise rejections that might be from LiveKit
 */
export const installUnhandledRejectionHandler = () => {
  const handler = (event) => {
    if (event.reason && shouldSuppressError(event.reason)) {
      event.preventDefault();
      return true;
    }
  };
  
  window.addEventListener('unhandledrejection', handler);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('unhandledrejection', handler);
  };
};

/**
 * Install console.log suppressor for LiveKit internal logs
 */
export const installLogSuppressor = () => {
  const originalConsoleLog = console.log;
  
  console.log = (...args) => {
    // Check if any of the arguments match suppressed patterns
    const shouldSuppress = args.some(arg => {
      if (typeof arg === 'string') {
        return SUPPRESSED_ERROR_PATTERNS.some(pattern => arg.includes(pattern));
      }
      return false;
    });
    
    // If not suppressed, call original console.log
    if (!shouldSuppress) {
      originalConsoleLog.apply(console, args);
    }
  };
  
  // Return cleanup function
  return () => {
    console.log = originalConsoleLog;
  };
};

/**
 * Install console.warn suppressor for LiveKit internal warnings
 */
export const installWarnSuppressor = () => {
  const originalConsoleWarn = console.warn;
  
  console.warn = (...args) => {
    // Check if any of the arguments match suppressed patterns
    const shouldSuppress = args.some(arg => {
      if (typeof arg === 'string') {
        return SUPPRESSED_ERROR_PATTERNS.some(pattern => arg.includes(pattern));
      }
      if (typeof arg === 'object' && arg !== null) {
        const str = JSON.stringify(arg);
        return SUPPRESSED_ERROR_PATTERNS.some(pattern => str.includes(pattern));
      }
      return false;
    });
    
    // If not suppressed, call original console.warn
    if (!shouldSuppress) {
      originalConsoleWarn.apply(console, args);
    }
  };
  
  // Return cleanup function
  return () => {
    console.warn = originalConsoleWarn;
  };
};

/**
 * Install all error suppressors
 * Returns a cleanup function to remove all handlers
 */
export const installAllErrorSuppressors = () => {
  const cleanupFns = [
    installErrorSuppressor(),
    installLogSuppressor(),
    installWarnSuppressor(),
    installWindowErrorHandler(),
    installUnhandledRejectionHandler(),
  ];
  
  // Return combined cleanup function
  return () => {
    cleanupFns.forEach(cleanup => cleanup());
  };
};
