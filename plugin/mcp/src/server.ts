import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { KnowledgeStore } from './lib/knowledge-store.js';
import { registerStoreTools } from './tools/store.js';
import { registerSearchTools } from './tools/search.js';
import { registerProfileTools } from './tools/profile.js';
import { registerFeedbackTools } from './tools/feedback.js';
import { registerInteractionLogTools } from './tools/interaction-log.js';
import { registerMigrateTools } from './tools/migrate.js';

const server = new McpServer({
  name: 'handover',
  version: '0.1.0',
});

// Data directory defaults to .handover in current working directory
const dataDir = process.env.HANDOVER_DATA_DIR || '.handover';
const store = new KnowledgeStore(dataDir);

registerStoreTools(server, store, dataDir);
registerSearchTools(server, store);
registerProfileTools(server, dataDir);
registerFeedbackTools(server, dataDir);
registerInteractionLogTools(server, dataDir);
registerMigrateTools(server, store, dataDir);

const transport = new StdioServerTransport();
await server.connect(transport);
