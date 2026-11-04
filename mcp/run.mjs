// Starts the MCP server, or `login`. A plain .mjs launcher, so every host can run one simple
// command (node mcp/run.mjs) from any folder; tsx then lets the server use the app's own
// TypeScript in src/ai, which keeps its checks the same as the app's.
import { register } from 'tsx/esm/api'

register()
await import(process.argv[2] === 'login' ? './login.ts' : './server.ts')
