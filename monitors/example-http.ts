import { createMonitor } from '../mod.ts';
import { discord } from './notification.ts';

export default createMonitor({
  name: 'Example HTTP Monitor',
  type: 'https',
  url: 'https://example.com',
  interval: 10,
  notification: [discord],
  isDown: () => {
    return {
      down: Math.random() < 0.5,
      message: 'Randomly generated down status',
      channels: [discord.name],
    };
  },
});
