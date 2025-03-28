# mcp-installer - A MCP Server to install MCP Servers

This server is a tool that installs other MCP servers into your MCP client's configuration file. Install it, and you can ask your AI assistant (if it supports MCP) to install MCP servers hosted in npm or PyPI for you. Requires `npx` (from Node.js) and `uv` (from Python's Astral toolkit) to be installed for installing Node.js and Python-based servers respectively.

![image](https://github.com/user-attachments/assets/d082e614-b4bc-485c-a7c5-f80680348793)

### How to install:

Add this server definition to your MCP client's configuration file (the specific location and format depend on your client application). You **must** include the `--config-file` argument, pointing back to the configuration file itself, so the installer knows where to add new server definitions.
*(This configuration file is often named `mcp_settings.json` or similar, depending on the client.)*

```json
  "mcpServers": {
    "mcp-installer": {
      "command": "npx",
      "args": [
        "@ztripez/mcp-installer",
        "--config-file",
        "/path/to/your/mcp/client/config.json" // <-- IMPORTANT: Replace with the actual path
      ]
    }
  }
```

### Example prompts

> Install the MCP server named mcp-server-fetch

> Install the @modelcontextprotocol/server-filesystem package as an MCP server. Use ['/path/to/your/directory'] for the arguments

> Please install the MCP server located at /path/to/local/mcp-youtube.

> Install the server @modelcontextprotocol/server-github. Set the environment variable GITHUB_PERSONAL_ACCESS_TOKEN to 'your_token_here'
