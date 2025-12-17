import { json } from '@sveltejs/kit';
import { getMemoryMcp, getMemoryMcpConfig, peekMemoryMcpConnection, resetMemoryMcpConnection } from '$lib/server/memory-mcp';
import type { RequestHandler } from './$types';

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return typeof error === 'string' ? error : JSON.stringify(error);
}

export const GET: RequestHandler = async ({ url }) => {
	const connect = url.searchParams.get('connect') === '1';
	const reset = url.searchParams.get('reset') === '1';

	if (reset) resetMemoryMcpConnection();

	const config = getMemoryMcpConfig();
	const current = peekMemoryMcpConnection();

	if (!connect) {
		return json({
			ok: true,
			config,
			connected: Boolean(current),
			connection: current
		});
	}

	try {
		const conn = await getMemoryMcp();
		return json({
			ok: true,
			config,
			connected: true,
			connection: {
				pid: conn.transport.pid,
				connectedAt: conn.connectedAt,
				serverVersion: conn.client.getServerVersion(),
				lastError: conn.lastError,
				stderrTail: conn.stderrTail
			}
		});
	} catch (err) {
		return json(
			{
				ok: false,
				config,
				connected: false,
				error: errorMessage(err),
				connection: peekMemoryMcpConnection()
			},
			{ status: 500 }
		);
	}
};

