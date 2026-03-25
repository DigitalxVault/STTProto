// RADStrat RT Trainer — App Shell
// Phase 2 will add PTT (push-to-talk) behavior and audio capture.

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function (err) {
    console.warn('SW registration failed:', err);
  });
}
