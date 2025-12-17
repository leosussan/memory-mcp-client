<div align="center">
  <h1>Memory MCP Client</h1>
  <p>Local-first SvelteKit UI for browsing (and lightly editing) a <strong>Memory MCP</strong> graph by spawning a local MCP server over <strong>stdio</strong>.</p>

  <p>
    <img alt="SvelteKit" src="https://img.shields.io/badge/SvelteKit-FF3E00?logo=svelte&logoColor=white" />
    <img alt="Svelte 5" src="https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white" />
    <img alt="Node >= 18" src="https://img.shields.io/badge/Node-%3E%3D%2018-339933?logo=node.js&logoColor=white" />
    <img alt="MCP stdio" src="https://img.shields.io/badge/MCP-stdio-111111" />
  </p>
</div>

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Trust model](#trust-model)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

## Features

- Graph browsing: load full graph (`read_graph`), filter, drill into entities
- Relations: inspect incoming/outgoing edges for a selected entity
- Observations: add / edit / delete observations
- Entities: delete entities; rename entities (recreates entity + replays relations)
- Debugging: connection status, server version, and stderr tail in the UI

> Editing actions require a Memory MCP server that supports the relevant write tools (e.g. `add_observations`, `delete_entities`).

## Requirements

- Node.js (see `.tool-versions` for the pinned version if you use `asdf`)
- A Memory MCP server command available locally (via `PATH`, `npx`, etc.)

## Getting started

```sh
asdf install
npm install
cp .env.example .env
npm run dev
```

Open the dev server URL printed in your terminal.

## Configuration

The app connects to your Memory MCP server via **MCP stdio** by spawning a local process from the SvelteKit server.

| Variable | Default | Description |
| --- | --- | --- |
| `MEMORY_MCP_COMMAND` | `memory-mcp` | Executable to run (e.g. `memory-mcp`, `npx`) |
| `MEMORY_MCP_ARGS` | `[]` | Args for the command. Prefer a JSON array string like `["--flag","value"]` |
| `MEMORY_MCP_CWD` | (unset) | Optional working directory for the spawned process |

### Examples

Use the reference `server-memory`:

```bash
MEMORY_MCP_COMMAND=npx
MEMORY_MCP_ARGS=["-y","@modelcontextprotocol/server-memory"]
```

Use a local `memory-mcp` binary with flags:

```bash
MEMORY_MCP_COMMAND=memory-mcp
MEMORY_MCP_ARGS=["--flag","value"]
```

> `MEMORY_MCP_ARGS` supports a non-JSON fallback that splits on whitespace (no quoting support). Prefer JSON.

## How it works

- The UI calls SvelteKit endpoints under `src/routes/api/memory/*`.
- Endpoints spawn/connect to your configured MCP server via `@modelcontextprotocol/sdk` (stdio transport).
- The MCP process runs locally; there is no hosted backend required.

## Trust model

- This app spawns whatever `MEMORY_MCP_COMMAND` points to. Treat that command (and its dependencies) as trusted code.
- Avoid pointing it at untrusted executables/scripts, especially if you run this on a machine with sensitive data.

## Troubleshooting

If the UI shows **disconnected** or can’t load the graph:

- Confirm `MEMORY_MCP_COMMAND` runs from the same shell you use for `npm run dev`.
- Prefer JSON for `MEMORY_MCP_ARGS` (example: `["--flag","value"]`).
- In the UI, click **Reconnect** and expand **Server stderr (tail)**.

## Development

```sh
npm run dev
npm run build
npm run preview
npm run check
```

## Roadmap

- Create entities + relations from the UI
- Bulk editing / import/export
- Better search + graph navigation

## Contributing

Issues and PRs are welcome. Keep changes small and focused, and include screenshots for UI changes when possible.
