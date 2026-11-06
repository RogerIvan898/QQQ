let workerStarted = false;

export const applyMockServer = async (enabled: boolean) => {
  const { worker } = await import('./browser');

  if (enabled) {
    if (workerStarted) {
      return;
    }

    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    });
    workerStarted = true;
    return;
  }

  if (!workerStarted) {
    return;
  }

  worker.stop();
  workerStarted = false;
};
