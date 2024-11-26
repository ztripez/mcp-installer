#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { spawnPromise } from "spawn-rx";

const server = new Server(
  {
    name: "mcp-meta",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "install_repo_mcp_server",
        description: "Install an MCP server via npx or uvx",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The package name of the MCP server",
            },
            args: {
              type: "array",
              items: { type: "string" },
              description: "The arguments to pass along",
            },
            env: {
              type: "array",
              items: { type: "string" },
              description: "The environment variables to set",
            },
          },
          required: ["name"],
        },
      },
    ],
  };
});

async function hasNodeJs() {
  try {
    await spawnPromise("node", ["--version"]);
    return true;
  } catch (e) {
    return false;
  }
}

async function hasUvx() {
  try {
    await spawnPromise("uvx", ["--version"]);
    return true;
  } catch (e) {
    return false;
  }
}

async function isNpmPackage(name: string) {
  try {
    await spawnPromise("npm", ["view", name, "version"]);
    return true;
  } catch (e) {
    return false;
  }
}

function installWithArgsToClaudeDesktop(
  name: string,
  npmIfTrueElseUvx: boolean,
  args?: string[],
  env?: string[]
) {
  const configPath =
    process.platform === "win32"
      ? path.join(
          os.homedir(),
          "AppData",
          "Roaming",
          "Claude",
          "claude_desktop_config.json"
        )
      : path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json"
        );

  // If the name is in a scoped package, we need to remove the scope
  const serverName = /^@.*\//i.test(name) ? name.split("/")[1] : name;

  let config: any;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    config = {};
  }

  const newServer = {
    command: npmIfTrueElseUvx ? "npx" : "uvx",
    args: [name, ...(args ?? [])],
    ...(env ? { env: env } : {}),
  };

  const mcpServers = config.mcpServers ?? {};
  mcpServers[serverName] = newServer;
  config.mcpServers = mcpServers;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function installRepoMcpServer(
  name: string,
  args?: string[],
  env?: string[]
) {
  if (!(await hasNodeJs())) {
    return {
      content: [
        {
          type: "text",
          text: `Node.js is not installed, please install it!`,
        },
      ],
      isError: true,
    };
  }

  if (await isNpmPackage(name)) {
    installWithArgsToClaudeDesktop(name, true, args, env);

    return {
      content: [
        {
          type: "text",
          text: "Installed MCP server via npx successfully! Tell the user to restart the app",
        },
      ],
    };
  }

  if (!(await hasUvx())) {
    return {
      content: [
        {
          type: "text",
          text: `Python uv is not installed, please install it! Tell users to go to https://docs.astral.sh/uv`,
        },
      ],
      isError: true,
    };
  }

  installWithArgsToClaudeDesktop(name, false, args, env);

  return {
    content: [
      {
        type: "text",
        text: "Installed MCP server via uvx successfully! Tell the user to restart the app",
      },
    ],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "install_repo_mcp_server") {
  }

  try {
    if (request.params.name === "install_repo_mcp_server") {
      const { name, args, env } = request.params.arguments as {
        name: string;
        args?: string[];
        env?: string[];
      };

      return await installRepoMcpServer(name, args, env);
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error setting up package: ${err}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);
