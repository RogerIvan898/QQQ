let workerStarted = false;
let inPageStarted = false;

const startInPage = async () => {
  const { inPageNetwork } = await import('./in-page');

  inPageNetwork.enable();
  inPageStarted = true;
};

export const applyMockServer = async (enabled: boolean) => {
  if (enabled && (workerStarted || inPageStarted)) {
    return;
  }

  if (!enabled && inPageStarted) {
    const { inPageNetwork } = await import('./in-page');

    inPageNetwork.disable();
    inPageStarted = false;
    return;
  }

  if (enabled && !('serviceWorker' in navigator)) {
    await startInPage();
    return;
  }

  const { worker } = await import('./browser');

  if (enabled) {
    try {
      await worker.start({
        onUnhandledRequest: 'bypass',
        quiet: true,
        serviceWorker: {
          url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
          options: { scope: import.meta.env.BASE_URL },
        },
      });
      workerStarted = true;
    } catch (error) {
      console.warn(
        '[MockServer] Service worker unavailable, mocking in page',
        error
      );
      await startInPage();
    }

    return;
  }

  if (!workerStarted) {
    return;
  }

  worker.stop();
  workerStarted = false;
};
