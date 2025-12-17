import { json } from '@sveltejs/kit';
import { callMemoryTool } from '$lib/server/memory-mcp';
import type { RequestHandler } from './$types';

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return typeof error === 'string' ? error : JSON.stringify(error);
}

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
	}

	const entityNames =
		typeof body === 'object' && body && 'entityNames' in body && Array.isArray((body as any).entityNames)
			? ((body as any).entityNames as unknown[])
			: null;

	if (!entityNames || !entityNames.every((n) => typeof n === 'string' && n.trim())) {
		return json({ ok: false, error: 'Body must be { "entityNames": string[] }.' }, { status: 400 });
	}

	try {
		await callMemoryTool('delete_entities', { entityNames: entityNames.map((n) => (n as string).trim()) });
		return json({ ok: true });
	} catch (err) {
		return json({ ok: false, error: errorMessage(err) }, { status: 500 });
	}
};

