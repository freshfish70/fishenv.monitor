import { discord } from "../mod.ts";

export const alerts = discord({
  webhookUrl: Deno.env.get("DISCORD_WEBHOOK_URL") ?? "",
});

// A second endpoint of the same channel needs its own `name` — that name is
// what `isDown().channels` selects on.
export const oncall = discord({
  name: "oncall",
  webhookUrl: Deno.env.get("DISCORD_ONCALL_WEBHOOK_URL") ?? "",
  format: (_config, event) => ({
    title: `<@here> ${event.monitor.name} is ${event.state}`,
    color: event.state === "down" ? 0xff0000 : 0x00ff00,
    description: event.message,
  }),
});
