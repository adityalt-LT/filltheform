import { existsSync } from 'node:fs';
// Load .env (Node 22+) before anything reads the environment.
if (existsSync('.env')) process.loadEnvFile('.env');

const { createApp } = await import('./app.js');
const { closeBrowser } = await import('./lib/render.js');
const { aiEnabled, aiModel } = await import('./lib/ai.js');

const port = Number(process.env.PORT || 3000);
const app = createApp();
const server = app.listen(port, () => {
  console.log(`Tailor & Apply Kit running at http://localhost:${port}`);
  console.log(aiEnabled() ? `AI mode: on (${aiModel()})` : 'Basic mode (rule-based). Set ANTHROPIC_API_KEY for AI extraction and rewrite suggestions.');
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { server.close(); await closeBrowser(); process.exit(0); });
