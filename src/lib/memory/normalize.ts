import type { MemoryEntity, MemoryGraph, MemoryRelation } from './types';

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

export function normalizeGraph(raw: unknown): MemoryGraph {
	const anyRaw = raw as any;
	const entities: MemoryEntity[] = [];
	const relations: MemoryRelation[] = [];

	if (anyRaw && typeof anyRaw === 'object') {
		// canonical shape: { entities, relations }
		if (Array.isArray(anyRaw.entities)) {
			for (const e of anyRaw.entities) {
				if (!e || typeof e !== 'object') continue;
				const name = asString((e as any).name);
				if (!name) continue;
				entities.push({
					...(e as any),
					name,
					entityType: asString((e as any).entityType) ?? asString((e as any).type),
					observations: Array.isArray((e as any).observations)
						? (e as any).observations.filter((o: unknown) => typeof o === 'string')
						: undefined
				});
			}
		}

		if (Array.isArray(anyRaw.relations)) {
			for (const r of anyRaw.relations) {
				if (!r || typeof r !== 'object') continue;
				const from = asString((r as any).from);
				const to = asString((r as any).to);
				const relationType = asString((r as any).relationType) ?? asString((r as any).type);
				if (!from || !to || !relationType) continue;
				relations.push({ ...(r as any), from, to, relationType });
			}
		}

		// alternate: { nodes, edges }
		if (!entities.length && Array.isArray(anyRaw.nodes)) {
			for (const n of anyRaw.nodes) {
				if (!n || typeof n !== 'object') continue;
				const name = asString((n as any).name) ?? asString((n as any).id);
				if (!name) continue;
				entities.push({
					...(n as any),
					name,
					entityType: asString((n as any).entityType) ?? asString((n as any).type),
					observations: Array.isArray((n as any).observations)
						? (n as any).observations.filter((o: unknown) => typeof o === 'string')
						: undefined
				});
			}
		}

		if (!relations.length && Array.isArray(anyRaw.edges)) {
			for (const e of anyRaw.edges) {
				if (!e || typeof e !== 'object') continue;
				const from = asString((e as any).from) ?? asString((e as any).source);
				const to = asString((e as any).to) ?? asString((e as any).target);
				const relationType = asString((e as any).relationType) ?? asString((e as any).type);
				if (!from || !to || !relationType) continue;
				relations.push({ ...(e as any), from, to, relationType });
			}
		}
	}

	return { entities, relations, raw };
}

