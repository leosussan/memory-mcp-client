import { json } from '@sveltejs/kit';
import { callMemoryTool } from '$lib/server/memory-mcp';
import type { RequestHandler } from './$types';

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return typeof error === 'string' ? error : JSON.stringify(error);
}

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim();
	if (!query) return json({ ok: true, results: [] });

	try {
		const results = await callMemoryTool('search_nodes', { query });
		return json({ ok: true, results });
	} catch (err) {
		return json({ ok: false, error: errorMessage(err) }, { status: 500 });
	}
};

