import type {
  ChannelFactory,
  NotificationEvent,
} from "../types/notification.ts";
import { defineChannel } from "./define-channel.ts";
import { defaultMessage } from "./format.ts";

export interface TelegramEndpointConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramMessage {
  title: string;
  description: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

function defaultFormat(
  _config: TelegramEndpointConfig,
  event: NotificationEvent,
): TelegramMessage {
  return defaultMessage(event);
}

function dispatch(
  _config: TelegramEndpointConfig,
  _message: TelegramMessage,
): Promise<void> {
  throw new Error("The telegram notification channel is not implemented yet.");
}

export const telegram: ChannelFactory<TelegramEndpointConfig, TelegramMessage> =
  defineChannel({
    type: "telegram",
    defaultFormat,
    dispatch,
  });
