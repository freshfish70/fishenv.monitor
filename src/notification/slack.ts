import type {
  BaseNotificationEndpointConfig,
  MonitorNotifyContext,
  NotificationChannel,
  NotificationMessage,
} from "../types/notification.ts";

export interface SlackEndpointConfig
  extends BaseNotificationEndpointConfig<"slack"> {
  webhookUrl: string;
}

function defaultSendOnDown(
  _config: SlackEndpointConfig,
  ctx: MonitorNotifyContext,
): NotificationMessage {
  return { title: `Service is down: ${ctx.name}`, description: ctx.message };
}

function defaultSendOnUp(
  _config: SlackEndpointConfig,
  ctx: MonitorNotifyContext,
): NotificationMessage {
  return { title: `Service ${ctx.name} is up again`, description: ctx.message };
}

function dispatch(
  _config: SlackEndpointConfig,
  _message: NotificationMessage,
): Promise<void> {
  throw new Error("The slack notification channel is not implemented yet.");
}

export const slackChannel: NotificationChannel<SlackEndpointConfig> = {
  defaultSendOnDown,
  defaultSendOnUp,
  dispatch,
};
