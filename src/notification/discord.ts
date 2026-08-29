import type {
  BaseNotificationEndpointConfig,
  MonitorNotifyContext,
  NotificationChannel,
  NotificationMessage,
} from '../types/notification.ts';

export interface DiscordEndpointConfig extends BaseNotificationEndpointConfig<'discord'> {
  webhookUrl: string;
}

function defaultSendOnDown(
  _config: DiscordEndpointConfig,
  ctx: MonitorNotifyContext,
): NotificationMessage {
  return { title: `Service is down: ${ctx.name}`, description: ctx.message };
}

function defaultSendOnUp(
  _config: DiscordEndpointConfig,
  ctx: MonitorNotifyContext,
): NotificationMessage {
  return { title: `Service ${ctx.name} is up again`, description: ctx.message };
}

async function dispatch(
  config: DiscordEndpointConfig,
  message: NotificationMessage,
): Promise<void> {
  console.log(`Sending Discord notification to ${config.webhookUrl} with message:`, message);
  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      embeds: [{ title: message.title, description: message.description }],
    }),
  });
  await res.body?.cancel();
  if (!res.ok) {
    throw new Error(`Discord webhook responded with ${res.status}`);
  }
}

export const discordChannel: NotificationChannel<DiscordEndpointConfig> = {
  defaultSendOnDown,
  defaultSendOnUp,
  dispatch,
};
