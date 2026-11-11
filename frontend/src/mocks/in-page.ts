import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { defineNetwork, InterceptorSource } from 'msw/experimental';

import { httpHandlers } from './http';
import { wsHandlers } from './ws';

type InterceptorList = ConstructorParameters<
  typeof InterceptorSource
>[0]['interceptors'];

export const inPageNetwork = defineNetwork({
  sources: [
    new InterceptorSource({
      interceptors: [
        new FetchInterceptor(),
        new XMLHttpRequestInterceptor(),
        new WebSocketInterceptor(),
      ] as unknown as InterceptorList,
    }),
  ],
  handlers: [...httpHandlers, ...wsHandlers],
  onUnhandledFrame: 'bypass',
  context: { quiet: true },
});
