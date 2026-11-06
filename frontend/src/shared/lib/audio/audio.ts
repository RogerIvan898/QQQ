import { isSoundEnabled } from './sound-setting';

let audioContext: AudioContext | null = null;

export const bufferCache = new Map<string, AudioBuffer>();
const loadPromises = new Map<string, Promise<AudioBuffer>>();

export const getAudioContext = () => {
  audioContext ??= new AudioContext();

  return audioContext;
};

export const loadBuffer = (url: string) => {
  const cached = bufferCache.get(url);

  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = loadPromises.get(url);

  if (pending) {
    return pending;
  }

  const promise = (async () => {
    const context = getAudioContext();

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to load sound: ${url} (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer);

    bufferCache.set(url, decoded);

    return decoded;
  })();

  loadPromises.set(url, promise);

  promise.catch(() => loadPromises.delete(url));

  return promise;
};

export const startBuffer = (buffer: AudioBuffer, volume = 1) => {
  if (!isSoundEnabled()) {
    return;
  }

  const context = getAudioContext();

  // While suspended the context clock is frozen, so anything started now
  // would pile up and play all at once on resume. Wake it and drop the sound.
  if (context.state !== 'running') {
    void context.resume().catch(() => undefined);
    return;
  }

  const source = context.createBufferSource();
  const gain = context.createGain();

  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(context.destination);
  source.start(0);
};

const MAX_LATE_MS = 250;

export const playBuffered = (url: string, volume = 1) => {
  const cached = bufferCache.get(url);

  if (cached) {
    startBuffer(cached, volume);
    return;
  }

  const requestedAt = performance.now();

  loadBuffer(url)
    .then(buffer => {
      // A sound that arrives long after its event would play out of sync.
      if (performance.now() - requestedAt > MAX_LATE_MS) {
        return;
      }

      startBuffer(buffer, volume);
    })
    .catch((error: unknown) => console.warn(`[Audio] ${url}`, error));
};

export const preloadSounds = async (urls: string[]) => {
  const results = await Promise.allSettled(urls.map(url => loadBuffer(url)));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`[Audio] ${urls[index]}`, result.reason);
    }
  });
};
