import { env } from '$env/dynamic/private';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type MemoryMcpConfig = {
	command: string;
	args: string[];
	cwd?: string;
};

type ConnectedMemoryMcp = {
	client: Client;
	transport: StdioClientTransport;
	connectedAt: number;
	stderrTail: string[];
	lastError?: string;
};

const STDERR_TAIL_LINES = 200;

let connected: ConnectedMemoryMcp | null = null;
let connectPromise: Promise<ConnectedMemoryMcp> | null = null;

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return typeof error === 'string' ? error : JSON.stringify(error);
}

function parseArgsFromEnv(raw: string | undefined): string[] {
	if (!raw) return [];

	const asJson = raw.trim();
	if (asJson.startsWith('[')) {
		const parsed = JSON.parse(asJson);
		if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
			throw new Error('MEMORY_MCP_ARGS must be a JSON array of strings, e.g. ["--flag","value"].');
		}
		return parsed;
	}

	// Fallback: whitespace split (no quoting support). Prefer JSON array format.
	return raw.split(/\s+/).filter(Boolean);
}

export function getMemoryMcpConfig(): MemoryMcpConfig {
	const command = env.MEMORY_MCP_COMMAND?.trim() || 'memory-mcp';
	const args = parseArgsFromEnv(env.MEMORY_MCP_ARGS);
	const cwd = env.MEMORY_MCP_CWD?.trim() || undefined;

	return { command, args, cwd };
}

export function peekMemoryMcpConnection():
	| (Pick<ConnectedMemoryMcp, 'connectedAt' | 'stderrTail' | 'lastError'> & {
			pid: number | null;
			serverVersion: unknown;
	  })
	| null {
	if (!connected) return null;
	return {
		connectedAt: connected.connectedAt,
		stderrTail: connected.stderrTail,
		lastError: connected.lastError,
		pid: connected.transport.pid,
		serverVersion: connected.client.getServerVersion()
	};
}

export function resetMemoryMcpConnection() {
	connectPromise = null;
	connected = null;
}

export async function getMemoryMcp(): Promise<ConnectedMemoryMcp> {
	if (connected) return connected;
	if (connectPromise) return connectPromise;

	connectPromise = (async () => {
		const config = getMemoryMcpConfig();

		const stderrTail: string[] = [];
		const transport = new StdioClientTransport({
			command: config.command,
			args: config.args,
			cwd: config.cwd,
			stderr: 'pipe'
		});

		const stderr = transport.stderr;
		if (stderr) {
			(stderr as unknown as { setEncoding?: (enc: string) => void }).setEncoding?.('utf8');
			stderr.on('data', (chunk: unknown) => {
				const text = String(chunk);
				for (const line of text.split(/\r?\n/)) {
					if (!line) continue;
					stderrTail.push(line);
					if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.splice(0, stderrTail.length - STDERR_TAIL_LINES);
				}
			});
		}

		const client = new Client(
			{ name: 'memory-mcp-client', version: '0.0.1' },
			{
				capabilities: {}
			}
		);

		let lastError: string | undefined;
		transport.onerror = (err: unknown) => {
			lastError = errorMessage(err);
		};
		transport.onclose = () => {
			// drop the singleton so the next request can reconnect
			connected = null;
			connectPromise = null;
		};

		try {
			await client.connect(transport);
		} catch (err) {
			lastError = errorMessage(err);
			throw err;
		}

		connected = {
			client,
			transport,
			connectedAt: Date.now(),
			stderrTail,
			lastError
		};

		return connected;
	})()
		.catch((err) => {
			connectPromise = null;
			connected = null;
			throw err;
		});

	return connectPromise;
}

export async function callMemoryTool(name: string, args: Record<string, unknown> = {}) {
	const { client } = await getMemoryMcp();
	const result = await client.callTool({ name, arguments: args });

	if ('toolResult' in result) return result.toolResult;
	if ('structuredContent' in result && result.structuredContent) return result.structuredContent;

	if ('content' in result) {
		const firstText = result.content.find((c) => c.type === 'text');
		if (firstText?.text) {
			try {
				return JSON.parse(firstText.text);
			} catch {
				// fall through
			}
		}
		return result;
	}

	return result;
}
