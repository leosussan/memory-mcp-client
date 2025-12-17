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
	const contents =
		typeof body === 'object' && body && 'contents' in body && Array.isArray((body as any).contents)
			? ((body as any).contents as unknown[]).filter((c) => typeof c === 'string' && c.trim()).map((c) => (c as string).trim())
			: [];

	if (!entityName || !contents.length) {
		return json({ ok: false, error: 'Body must be { "entityName": string, "contents": string[] }.' }, { status: 400 });
	}

	try {
		await callMemoryTool('add_observations', { observations: [{ entityName, contents }] });
		return json({ ok: true });
	} catch (err) {
		return json({ ok: false, error: errorMessage(err) }, { status: 500 });
	}
};

