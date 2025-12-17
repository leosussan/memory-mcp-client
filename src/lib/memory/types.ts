export type MemoryEntity = {
	name: string;
	entityType?: string;
	observations?: string[];
	[key: string]: unknown;
};

export type MemoryRelation = {
	from: string;
	to: string;
	relationType: string;
	[key: string]: unknown;
};

export type MemoryGraph = {
	entities: MemoryEntity[];
	relations: MemoryRelation[];
	raw?: unknown;
};

