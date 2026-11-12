import { randomUUID } from 'expo-crypto';

/** New idempotency key (UUID v4) for a write request. */
export function newRequestId(): string {
  return randomUUID();
}
