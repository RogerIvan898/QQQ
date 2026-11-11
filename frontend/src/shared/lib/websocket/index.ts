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
    let data: unknown = event.data;

    try {
      data = JSON.parse(String(event.data));
    } catch {
      void 0;
    }

    handlers?.onMessage?.(data);
  };

  socket.onerror = error => handlers?.onError?.(error);
  socket.onclose = () => handlers?.onClose?.();

  return socket;
};
