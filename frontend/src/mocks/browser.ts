import { setupWorker } from 'msw/browser';

import { httpHandlers } from './http';
import { wsHandlers } from './ws';

export const worker = setupWorker(...httpHandlers, ...wsHandlers);
