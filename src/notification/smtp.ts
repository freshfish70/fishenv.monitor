import type {
  ChannelFactory,
  NotificationEvent,
} from "../types/notification.ts";
import { defineChannel } from "./define-channel.ts";
import { defaultMessage } from "./format.ts";

export interface SmtpEndpointConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  from: string;
  to: string | string[];
}

export interface SmtpMessage {
  /** Used as the subject line. */
  title: string;
  description: string;
  /** Optional HTML body; `description` stays the plain-text alternative. */
  html?: string;
}

function defaultFormat(
  _config: SmtpEndpointConfig,
  event: NotificationEvent,
): SmtpMessage {
  return defaultMessage(event);
}

function dispatch(
  _config: SmtpEndpointConfig,
  _message: SmtpMessage,
): Promise<void> {
  throw new Error("The smtp notification channel is not implemented yet.");
}

export const smtp: ChannelFactory<SmtpEndpointConfig, SmtpMessage> =
  defineChannel({
    type: "smtp",
    defaultFormat,
    dispatch,
  });
