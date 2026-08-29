import { discordChannel } from "./discord.ts";
import { slackChannel } from "./slack.ts";
import { smtpChannel } from "./smtp.ts";
import { telegramChannel } from "./telegram.ts";

export const channelRegistry = {
  discord: discordChannel,
  slack: slackChannel,
  smtp: smtpChannel,
  telegram: telegramChannel,
} as const;
