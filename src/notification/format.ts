import type {
  NotificationEvent,
  NotificationMessage,
} from "../types/notification.ts";

const TITLES: Record<NotificationEvent["kind"], (name: string) => string> = {
  down: (name) => `Service is down: ${name}`,
  up: (name) => `Service ${name} is up again`,
  "still-down": (name) => `Service is still down: ${name}`,
  "still-up": (name) => `Service ${name} is up`,
};

/** The title every channel falls back to, so wording stays consistent. */
export function defaultTitle(event: NotificationEvent): string {
  return TITLES[event.kind](event.monitor.name);
}

/** The plain `{ title, description }` a channel with no richer shape uses. */
export function defaultMessage(event: NotificationEvent): NotificationMessage {
  return { title: defaultTitle(event), description: event.message };
}
