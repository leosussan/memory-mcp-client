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

	const names =
		typeof body === 'object' && body && 'names' in body && Array.isArray((body as any).names)
			? (body as any).names
			: null;

	if (!names || !names.every((n: unknown) => typeof n === 'string' && n.trim())) {
		return json({ ok: false, error: 'Body must be { "names": string[] }.' }, { status: 400 });
	}

	try {
		const nodes = await callMemoryTool('open_nodes', { names: names.map((n: string) => n.trim()) });
		return json({ ok: true, nodes });
	} catch (err) {
		return json({ ok: false, error: errorMessage(err) }, { status: 500 });
	}
};

