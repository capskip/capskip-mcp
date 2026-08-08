import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { ToolContext } from '../solver.js';

export function registerImageTool(server: McpServer, _ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_image_captcha',
    { description: 'Not yet implemented.', inputSchema: z.strictObject({}) },
    async () => ({ content: [{ type: 'text' as const, text: 'not implemented' }], isError: true }),
  );
}
