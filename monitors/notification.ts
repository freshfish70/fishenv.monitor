import { createNotificationEndpoint } from '../mod.ts';

export const discord = createNotificationEndpoint({
  type: 'discord',
  webhookUrl: Deno.env.get('DISCORD_WEBHOOK_URL') ?? '',
});
