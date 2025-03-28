#!/usr/bin/env node

import yargs from "yargs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as os from "os";
import * as fs from "node:fs";
import * as path from "path";
import { spawnPromise } from "spawn-rx";

// Declare configFilePath at a higher scope
let configFilePath: string;

const server = new Server(
  {
    name: "mcp-installer",
    version: "0.5.0",
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
        description:
          "Install an MCP server package (npm or PyPI) and add it to the client configuration file.",
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
              description: "The environment variables to set, delimited by =",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "install_local_mcp_server",
        description:
          "Install an MCP server from local source code and add it to the client configuration file.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "The path to the MCP server code cloned on your computer",
            },
            args: {
              type: "array",
              items: { type: "string" },
              description: "The arguments to pass along",
            },
            env: {
              type: "array",
              items: { type: "string" },
              description: "The environment variables to set, delimited by =",
            },
          },
          required: ["path"],
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

function installToServerConfig(
  name: string,
  cmd: string,
  args: string[],
  env?: string[]
) {
  let config: any;
  try {
    config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
  } catch (e) {
    // If file doesn't exist or is invalid JSON, start with an empty config
    config = {};
  }

  const envObj = (env ?? []).reduce((acc, val) => {
    const [key, ...valueParts] = val.split("="); // Handle values containing '='
    acc[key] = valueParts.join("=");
    return acc;
  }, {} as Record<string, string>);

  const newServer = {
    command: cmd,
    args: args,
    ...(env ? { env: envObj } : {}),
  };

  const mcpServers = config.mcpServers ?? {};
  mcpServers[name] = newServer;
  config.mcpServers = mcpServers;
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
}

function installRepoToServerConfig(
  name: string,
  npmIfTrueElseUvx: boolean,
  args?: string[],
  env?: string[]
) {
  // Use the last part of a scoped package name as the server key
  const serverName = /^@.*\//i.test(name) ? name.split("/")[1] : name;

  installToServerConfig(
    serverName,
    npmIfTrueElseUvx ? "npx" : "uvx",
    [name, ...(args ?? [])],
    env
  );
}

async function attemptNodeInstall(
  directory: string
): Promise<Record<string, string>> {
  await spawnPromise("npm", ["install"], { cwd: directory });

  // Run down package.json looking for bins
  const pkg = JSON.parse(
    fs.readFileSync(path.join(directory, "package.json"), "utf-8")
  );

  if (pkg.bin) {
    return Object.keys(pkg.bin).reduce((acc, key) => {
      acc[key] = path.resolve(directory, pkg.bin[key]);
      return acc;
    }, {} as Record<string, string>);
  }

  if (pkg.main) {
    return { [pkg.name]: path.resolve(directory, pkg.main) };
  }

  return {};
}

async function installLocalMcpServer(
  dirPath: string,
  args?: string[],
  env?: string[]
) {
  if (!fs.existsSync(dirPath)) {
    return {
      content: [
        {
          type: "text",
          text: `Path ${dirPath} does not exist locally!`,
        },
      ],
      isError: true,
    };
  }

  if (fs.existsSync(path.join(dirPath, "package.json"))) {
    const servers = await attemptNodeInstall(dirPath);

    Object.keys(servers).forEach((name) => {
      installToServerConfig(
        name,
        "node",
        [servers[name], ...(args ?? [])],
        env
      );
    });

    return {
      content: [
        {
          type: "text",
          text: `Installed the following local Node.js servers: ${Object.keys(
            servers
          ).join("; ")}. The client application may need to be restarted.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Can't figure out how to install ${dirPath}`,
      },
    ],
    isError: true,
  };
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
    installRepoToServerConfig(name, true, args, env);

    return {
      content: [
        {
          type: "text",
          text: `Installed MCP server '${name}' via npx successfully! The client application may need to be restarted.`,
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

  installRepoToServerConfig(name, false, args, env);

  return {
    content: [
      {
        type: "text",
        text: `Installed MCP server '${name}' via uvx successfully! The client application may need to be restarted.`,
      },
    ],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === "install_repo_mcp_server") {
      const { name, args, env } = request.params.arguments as {
        name: string;
        args?: string[];
        env?: string[];
      };

      return await installRepoMcpServer(name, args, env);
    }

    if (request.params.name === "install_local_mcp_server") {
      const dirPath = request.params.arguments!.path as string;
      const { args, env } = request.params.arguments as {
        args?: string[];
        env?: string[];
      };

      return await installLocalMcpServer(dirPath, args, env);
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
  // This function now assumes server is already configured and configFilePath is set
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  // Parse command line arguments inside async function
  const argv = await yargs(process.argv.slice(2))
    .option("config-file", {
      alias: "c",
      description: "Path to the MCP client configuration file (JSON)",
      type: "string",
      demandOption: true, // Make the argument required
    })
    .help()
    .alias("help", "h").argv;

  // Assign parsed path to the higher-scoped variable
  configFilePath = argv.configFile;

  // Now run the server
  await runServer();
}

// Execute the main async function
main().catch(console.error);
