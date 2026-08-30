import type {
  ChannelFactory,
  NotificationEvent,
} from "../types/notification.ts";
import { defineChannel } from "./define-channel.ts";

export interface DiscordEndpointConfig {
  webhookUrl: string;
  /** Overrides the webhook's configured name. */
  username?: string;
}

/** Discord's embed shape — richer than the default `{ title, description }`. */
export interface DiscordMessage {
  title: string;
  description: string;
  /** Embed sidebar color, as an integer. Defaults per event kind. */
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  url?: string;
}

const COLORS: Record<NotificationEvent["kind"], number> = {
  down: 0xe5484d,
  up: 0x30a46c,
  "still-down": 0xf76b15,
  "still-up": 0x8b8d98,
};

const TITLES: Record<NotificationEvent["kind"], (name: string) => string> = {
  down: (name) => `Service is down: ${name}`,
  up: (name) => `Service ${name} is up again`,
  "still-down": (name) => `Service is still down: ${name}`,
  "still-up": (name) => `Service ${name} is up`,
};

function defaultFormat(
  _config: DiscordEndpointConfig,
  event: NotificationEvent,
): DiscordMessage {
  const fields: DiscordMessage["fields"] = [
    { name: "Monitor", value: event.monitor.name, inline: true },
    { name: "Type", value: event.monitor.type, inline: true },
    {
      name: "Duration",
      value: `${Math.round(event.durationMs)}ms`,
      inline: true,
    },
  ];

  if (event.consecutive > 1) {
    fields.push({
      name: "Consecutive",
      value: `${event.consecutive} checks ${event.state}`,
      inline: true,
    });
  }
  if ("status" in event.result) {
    fields.push({
      name: "Status",
      value: String(event.result.status),
      inline: true,
    });
  }

  return {
    title: TITLES[event.kind](event.monitor.name),
    description: event.message,
    color: COLORS[event.kind],
    fields,
  };
}

async function dispatch(
  config: DiscordEndpointConfig,
  message: DiscordMessage,
): Promise<void> {
  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: config.username,
      embeds: [{
        title: message.title,
        description: message.description,
        color: message.color,
        fields: message.fields,
        url: message.url,
      }],
    }),
  });
  await res.body?.cancel();
  if (!res.ok) {
    throw new Error(`Discord webhook responded with ${res.status}`);
  }
}

export const discord: ChannelFactory<DiscordEndpointConfig, DiscordMessage> =
  defineChannel({
    type: "discord",
    defaultFormat,
    dispatch,
  });
