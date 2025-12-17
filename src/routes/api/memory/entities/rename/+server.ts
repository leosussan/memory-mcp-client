import { json } from '@sveltejs/kit';
import { callMemoryTool } from '$lib/server/memory-mcp';
import type { RequestHandler } from './$types';

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return typeof error === 'string' ? error : JSON.stringify(error);
}

type GraphEntity = {
	name?: unknown;
	entityType?: unknown;
	type?: unknown;
	observations?: unknown;
};

type GraphRelation = {
	from?: unknown;
	to?: unknown;
	relationType?: unknown;
	type?: unknown;
};

function asString(v: unknown): string | undefined {
	return typeof v === 'string' && v.trim() ? v : undefined;
}

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
	}

	const fromName = typeof body === 'object' && body && 'fromName' in body ? asString((body as any).fromName) : undefined;
	const toName = typeof body === 'object' && body && 'toName' in body ? asString((body as any).toName) : undefined;
	const toType = typeof body === 'object' && body && 'toType' in body ? asString((body as any).toType) : undefined;

	if (!fromName || !toName) {
		return json({ ok: false, error: 'Body must be { "fromName": string, "toName": string, "toType"?: string }.' }, { status: 400 });
	}
	if (fromName === toName) {
		return json({ ok: false, error: 'fromName and toName must be different.' }, { status: 400 });
	}

	try {
		const rawGraph = (await callMemoryTool('read_graph')) as any;
		const entities: GraphEntity[] = Array.isArray(rawGraph?.entities) ? rawGraph.entities : [];
		const relations: GraphRelation[] = Array.isArray(rawGraph?.relations) ? rawGraph.relations : [];

		const source = entities.find((e) => asString(e?.name) === fromName);
		if (!source) return json({ ok: false, error: `Entity not found: ${fromName}` }, { status: 404 });

		const existingTarget = entities.find((e) => asString(e?.name) === toName);
		if (existingTarget) return json({ ok: false, error: `Target entity already exists: ${toName}` }, { status: 409 });

		const entityType = toType ?? asString(source.entityType) ?? asString((source as any).type);
		const observations = Array.isArray((source as any).observations)
			? (source as any).observations.filter((o: unknown) => typeof o === 'string')
			: [];

		// 1) create new entity
		await callMemoryTool('create_entities', {
			entities: [
				{
					name: toName,
					entityType,
					observations
				}
			]
		});

		// 2) recreate relations with updated endpoints
		const relsToRecreate = relations
			.map((r) => {
				const from = asString((r as any).from);
				const to = asString((r as any).to);
				const relationType = asString((r as any).relationType) ?? asString((r as any).type);
				if (!from || !to || !relationType) return null;
				if (from !== fromName && to !== fromName) return null;
				return {
					from: from === fromName ? toName : from,
					to: to === fromName ? toName : to,
					relationType
				};
			})
			.filter(Boolean);

		if (relsToRecreate.length) {
			await callMemoryTool('create_relations', { relations: relsToRecreate });
		}

		// 3) delete old entity
		await callMemoryTool('delete_entities', { entityNames: [fromName] });

		return json({ ok: true, createdRelations: relsToRecreate.length });
	} catch (err) {
		return json({ ok: false, error: errorMessage(err) }, { status: 500 });
	}
};

