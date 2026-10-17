// Local read-only companion: reuse existing Agent execution; never opens the Work data volume.
import { createAgentServer } from '../../agent-service/src/server.js';
import { createWebChatExecutor } from '../../agent-service/src/web-chat.js';
const service = await createAgentServer({ internalToken: process.env.AGENT_INTERNAL_TOKEN, webExecutor: createWebChatExecutor() });
const port = Number(process.env.VOICE_LOCAL_AGENT_PORT || 48086);
service.server.listen(port, '127.0.0.1', () => console.log('Local read-only Agent ready'));
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await service.close(); process.exit(0); });
