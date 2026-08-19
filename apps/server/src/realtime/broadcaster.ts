import type { MessageDto } from './events';

/**
 * Seam between business logic and the socket layer.
 *
 * Services publish through this instead of importing the Socket.io server, so
 * message creation stays testable without standing up a gateway, and a REST
 * post and a socket send broadcast through the exact same path.
 */
export interface Broadcaster {
  messageCreated(message: MessageDto): void;
}

const noopBroadcaster: Broadcaster = {
  messageCreated: () => {
    // No gateway attached (tests, scripts) — deliberately silent.
  },
};

let current: Broadcaster = noopBroadcaster;

export function setBroadcaster(broadcaster: Broadcaster): void {
  current = broadcaster;
}

export function getBroadcaster(): Broadcaster {
  return current;
}

export function resetBroadcaster(): void {
  current = noopBroadcaster;
}
