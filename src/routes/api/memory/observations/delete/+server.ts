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

	const entityName =
		typeof body === 'object' && body && 'entityName' in body && typeof (body as any).entityName === 'string'
			? ((body as any).entityName as string).trim()
			: '';
	const observations =
		typeof body === 'object' && body && 'observations' in body && Array.isArray((body as any).observations)
			? ((body as any).observations as unknown[])
					.filter((c) => typeof c === 'string' && c.trim())
					.map((c) => (c as string).trim())
			: [];

	if (!entityName || !observations.length) {
		return json({ ok: false, error: 'Body must be { "entityName": string, "observations": string[] }.' }, { status: 400 });
	}

	try {
		await callMemoryTool('delete_observations', { deletions: [{ entityName, observations }] });
		return json({ ok: true });
	} catch (err) {
		return json({ ok: false, error: errorMessage(err) }, { status: 500 });
	}
};

