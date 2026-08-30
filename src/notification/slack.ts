import type {
  ChannelFactory,
  NotificationEvent,
} from "../types/notification.ts";
import { defineChannel } from "./define-channel.ts";
import { defaultMessage } from "./format.ts";

export interface SlackEndpointConfig {
  webhookUrl: string;
}

export interface SlackMessage {
  title: string;
  description: string;
  /** Raw Block Kit blocks. When set, the channel sends these instead of text. */
  blocks?: unknown[];
}

function defaultFormat(
  _config: SlackEndpointConfig,
  event: NotificationEvent,
): SlackMessage {
  return defaultMessage(event);
}

function dispatch(
  _config: SlackEndpointConfig,
  _message: SlackMessage,
): Promise<void> {
  throw new Error("The slack notification channel is not implemented yet.");
}

export const slack: ChannelFactory<SlackEndpointConfig, SlackMessage> =
  defineChannel({
    type: "slack",
    defaultFormat,
    dispatch,
  });
