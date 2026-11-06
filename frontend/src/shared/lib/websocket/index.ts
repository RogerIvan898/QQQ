export const createSocket = (
  url: string,
  handlers?: {
    onMessage?: (data: unknown) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
  }
) => {
  const socket = new WebSocket(url);

  socket.onopen = () => handlers?.onOpen?.();

  socket.onmessage = event => {
    try {
      handlers?.onMessage?.(JSON.parse(String(event.data)));
    } catch {
      handlers?.onMessage?.(event.data);
    }
  };

  socket.onerror = error => handlers?.onError?.(error);
  socket.onclose = () => handlers?.onClose?.();

  return socket;
};
