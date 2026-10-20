import { createApp } from './app.js';
import { closeBrowser } from './lib/render.js';
import { aiEnabled } from './lib/ai.js';

const port = Number(process.env.PORT || 3000);
const app = createApp();
const server = app.listen(port, () => {
  console.log(`Tailor & Apply Kit running at http://localhost:${port}`);
  console.log(aiEnabled() ? 'AI mode: on' : 'Basic mode (rule-based). Set ANTHROPIC_API_KEY for AI extraction and rewrite suggestions.');
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { server.close(); await closeBrowser(); process.exit(0); });
