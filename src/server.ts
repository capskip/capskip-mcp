import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { CapSkipConfig } from './config.js';
import { createContext } from './solver.js';
import { registerGeetestTool } from './tools/geetest.js';
import { registerImageTool } from './tools/image.js';
import { registerRecaptchaTool } from './tools/recaptcha.js';
import { registerStatusTool } from './tools/status.js';
import { registerTurnstileTool } from './tools/turnstile.js';

export const SERVER_NAME = 'capskip';
export const SERVER_VERSION = '1.0.0';

/** Build a fully-registered MCP server. Does not connect a transport. */
export function createServer(config: CapSkipConfig): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Solve captchas through a locally-running CapSkip desktop app. Use these '
        + 'tools when browser automation is blocked by a captcha: read the sitekey '
        + 'from the page, call the matching tool, then place the returned token in '
        + "the page's response field. If a solve fails unexpectedly, call "
        + 'capskip_status to check CapSkip is running.',
    },
  );

  const ctx = createContext(config);

  registerStatusTool(server, ctx);
  registerImageTool(server, ctx);
  registerRecaptchaTool(server, ctx);
  registerTurnstileTool(server, ctx);
  registerGeetestTool(server, ctx);

  return server;
}
