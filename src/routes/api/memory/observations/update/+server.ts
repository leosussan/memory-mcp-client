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
	const from =
		typeof body === 'object' && body && 'from' in body && typeof (body as any).from === 'string'
			? ((body as any).from as string).trim()
			: '';
	const to =
		typeof body === 'object' && body && 'to' in body && typeof (body as any).to === 'string'
			? ((body as any).to as string).trim()
			: '';

	if (!entityName || !from || !to) {
		return json(
			{ ok: false, error: 'Body must be { "entityName": string, "from": string, "to": string }.' },
			{ status: 400 }
		);
	}

	try {
		if (from !== to) {
			await callMemoryTool('delete_observations', { deletions: [{ entityName, observations: [from] }] });
			await callMemoryTool('add_observations', { observations: [{ entityName, contents: [to] }] });
		}
		return json({ ok: true });
	} catch (err) {
		return json({ ok: false, error: errorMessage(err) }, { status: 500 });
	}
};

