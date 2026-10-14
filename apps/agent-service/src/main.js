import { resolve } from 'node:path';
import { createAgentServer } from './server.js';
import { createClaudeExecutor } from './claude.js';

const service = await createAgentServer({ internalToken: process.env.AGENT_INTERNAL_TOKEN, dataDir: resolve(process.env.AGENT_DATA_DIR || '.data'), executor: createClaudeExecutor() });
const port = Number(process.env.AGENT_PORT || 48082);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AGENT_PORT invalid');
service.server.listen(port, process.env.AGENT_BIND_HOST || '127.0.0.1', () => console.log(`Agent service ready on port ${port}; engine=claude-agent-sdk`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await service.close(); process.exit(0); });
