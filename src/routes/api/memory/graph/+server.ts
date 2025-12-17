import { json } from '@sveltejs/kit';
import { callMemoryTool } from '$lib/server/memory-mcp';
import type { RequestHandler } from './$types';

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return typeof error === 'string' ? error : JSON.stringify(error);
}

export const GET: RequestHandler = async () => {
	try {
		const graph = await callMemoryTool('read_graph');
		return json({ ok: true, graph });
	} catch (err) {
		return json({ ok: false, error: errorMessage(err) }, { status: 500 });
	}
};

