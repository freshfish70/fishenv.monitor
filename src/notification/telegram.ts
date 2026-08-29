import type {
  BaseNotificationEndpointConfig,
  MonitorNotifyContext,
  NotificationChannel,
  NotificationMessage,
} from "../types/notification.ts";

export interface TelegramEndpointConfig
  extends BaseNotificationEndpointConfig<"telegram"> {
  botToken: string;
  chatId: string;
}

function defaultSendOnDown(
  _config: TelegramEndpointConfig,
  ctx: MonitorNotifyContext,
): NotificationMessage {
  return { title: `Service is down: ${ctx.name}`, description: ctx.message };
}

function defaultSendOnUp(
  _config: TelegramEndpointConfig,
  ctx: MonitorNotifyContext,
): NotificationMessage {
  return { title: `Service ${ctx.name} is up again`, description: ctx.message };
}

function dispatch(
  _config: TelegramEndpointConfig,
  _message: NotificationMessage,
): Promise<void> {
  throw new Error("The telegram notification channel is not implemented yet.");
}

export const telegramChannel: NotificationChannel<TelegramEndpointConfig> = {
  defaultSendOnDown,
  defaultSendOnUp,
  dispatch,
};
