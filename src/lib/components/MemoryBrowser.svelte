<script lang="ts">
	import { onMount } from 'svelte';
	import { normalizeGraph } from '$lib/memory/normalize';
	import type { MemoryEntity, MemoryGraph, MemoryRelation } from '$lib/memory/types';

	type StatusPayload = {
		ok: boolean;
		config: { command: string; args: string[]; cwd?: string };
		connected: boolean;
		connection?: {
			pid: number | null;
			connectedAt: number;
			serverVersion: unknown;
			lastError?: string;
			stderrTail: string[];
		} | null;
		error?: string;
	};

	function errorMessage(error: unknown): string {
		if (error instanceof Error) return error.message;
		return typeof error === 'string' ? error : JSON.stringify(error);
	}

	let status = $state<StatusPayload | null>(null);
	let statusError = $state<string | null>(null);
	let graph = $state<MemoryGraph | null>(null);
	let graphError = $state<string | null>(null);
	let loading = $state(false);
	let actionError = $state<string | null>(null);
	let actionBusy = $state(false);

	let filter = $state('');
	let selectedName = $state<string | null>(null);
	let newObservation = $state('');

	let renameOpen = $state(false);
	let renameToName = $state('');
	let renameToType = $state('');

	const entitiesSorted = $derived.by(() => {
		const list = graph?.entities ?? [];
		return [...list].sort((a, b) => a.name.localeCompare(b.name));
	});

	const entitiesFiltered = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return entitiesSorted;
		return entitiesSorted.filter((e: MemoryEntity) => {
			if (e.name.toLowerCase().includes(q)) return true;
			if ((e.entityType ?? '').toLowerCase().includes(q)) return true;
			const obs = e.observations ?? [];
			return obs.some((o: string) => o.toLowerCase().includes(q));
		});
	});

	const entityByName = $derived.by(() => {
		const map = new Map<string, MemoryEntity>();
		for (const e of graph?.entities ?? []) map.set(e.name, e);
		return map;
	});

	const relationsByFrom = $derived.by(() => {
		const map = new Map<string, MemoryRelation[]>();
		for (const r of graph?.relations ?? []) {
			const arr = map.get(r.from) ?? [];
			arr.push(r);
			map.set(r.from, arr);
		}
		for (const [k, v] of map) v.sort((a, b) => (a.relationType + a.to).localeCompare(b.relationType + b.to));
		return map;
	});

	const relationsByTo = $derived.by(() => {
		const map = new Map<string, MemoryRelation[]>();
		for (const r of graph?.relations ?? []) {
			const arr = map.get(r.to) ?? [];
			arr.push(r);
			map.set(r.to, arr);
		}
		for (const [k, v] of map) v.sort((a, b) => (a.relationType + a.from).localeCompare(b.relationType + b.from));
		return map;
	});

	const selectedEntity = $derived.by(() => (selectedName ? entityByName.get(selectedName) ?? null : null));

	let editingObsIndex = $state<number | null>(null);
	let editingObsValue = $state('');

	function resetActionState() {
		actionError = null;
		actionBusy = false;
	}

	async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = (await res.json()) as any;
		if (!res.ok || !data?.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
		return data as T;
	}

	async function fetchStatus({ connect = false, reset = false }: { connect?: boolean; reset?: boolean } = {}) {
		statusError = null;
		try {
			const url = new URL('/api/memory/status', window.location.origin);
			if (connect) url.searchParams.set('connect', '1');
			if (reset) url.searchParams.set('reset', '1');
			const res = await fetch(url);
			const data = (await res.json()) as StatusPayload;
			status = data;
			if (!res.ok) statusError = data.error ?? `Status request failed (${res.status}).`;
		} catch (err) {
			statusError = errorMessage(err);
		}
	}

	async function fetchGraph() {
		loading = true;
		graphError = null;
		try {
			const res = await fetch('/api/memory/graph');
			const data = (await res.json()) as { ok: boolean; graph?: unknown; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error ?? `Graph request failed (${res.status}).`);
			graph = normalizeGraph(data.graph);
			if (selectedName && !graph.entities.some((e) => e.name === selectedName)) selectedName = null;
			if (!selectedName && graph.entities.length) selectedName = graph.entities[0].name;
		} catch (err) {
			graphError = errorMessage(err);
			graph = null;
		} finally {
			loading = false;
		}
	}

	async function refreshAll() {
		await fetchStatus({ connect: true });
		await fetchGraph();
	}

	async function deleteEntity(name: string) {
		if (!confirm(`Delete entity "${name}"?\n\nThis will remove the entity and its observations from the memory store.`))
			return;
		resetActionState();
		actionBusy = true;
		try {
			await postJson('/api/memory/entities/delete', { entityNames: [name] });
			if (selectedName === name) selectedName = null;
			await fetchGraph();
		} catch (err) {
			actionError = errorMessage(err);
		} finally {
			actionBusy = false;
		}
	}

	function openRename() {
		renameOpen = true;
		renameToName = selectedEntity?.name ? `${selectedEntity.name}-renamed` : '';
		renameToType = selectedEntity?.entityType ?? '';
	}

	async function renameEntity(fromName: string, toName: string, toType?: string) {
		if (!toName.trim() || toName.trim() === fromName) {
			actionError = 'New name must be different and non-empty.';
			return;
		}
		if (
			!confirm(
				`Rename "${fromName}" → "${toName.trim()}"?\n\nThis recreates the entity, replays its relations, then deletes the old one.`
			)
		)
			return;

		resetActionState();
		actionBusy = true;
		try {
			await postJson('/api/memory/entities/rename', { fromName, toName: toName.trim(), toType: toType?.trim() || undefined });
			selectedName = toName.trim();
			renameOpen = false;
			await fetchGraph();
		} catch (err) {
			actionError = errorMessage(err);
		} finally {
			actionBusy = false;
		}
	}

	async function addObservation(entityName: string, value: string) {
		const v = value.trim();
		if (!v) return;
		resetActionState();
		actionBusy = true;
		try {
			await postJson('/api/memory/observations/add', { entityName, contents: [v] });
			newObservation = '';
			await fetchGraph();
		} catch (err) {
			actionError = errorMessage(err);
		} finally {
			actionBusy = false;
		}
	}

	async function deleteObservation(entityName: string, value: string) {
		if (!confirm('Delete this observation?')) return;
		resetActionState();
		actionBusy = true;
		try {
			await postJson('/api/memory/observations/delete', { entityName, observations: [value] });
			editingObsIndex = null;
			editingObsValue = '';
			await fetchGraph();
		} catch (err) {
			actionError = errorMessage(err);
		} finally {
			actionBusy = false;
		}
	}

	function startEditObservation(index: number, value: string) {
		editingObsIndex = index;
		editingObsValue = value;
	}

	function cancelEditObservation() {
		editingObsIndex = null;
		editingObsValue = '';
	}

	async function saveEditObservation(entityName: string, from: string, to: string) {
		const v = to.trim();
		if (!v) {
			actionError = 'Observation cannot be empty.';
			return;
		}
		resetActionState();
		actionBusy = true;
		try {
			await postJson('/api/memory/observations/update', { entityName, from, to: v });
			cancelEditObservation();
			await fetchGraph();
		} catch (err) {
			actionError = errorMessage(err);
		} finally {
			actionBusy = false;
		}
	}

	onMount(async () => {
		await refreshAll();
	});
</script>

<div class="app">
	<div class="topbar">
		<div class="brand">
			<h1>Memory MCP Client</h1>
			{#if status?.connected}
				<span class="pill ok">connected</span>
			{:else}
				<span class="pill bad">disconnected</span>
			{/if}
		</div>

		<div class="row">
			{#if status?.config}
				<span class="pill">{status.config.command}</span>
			{/if}
			<button class="btn primary" onclick={refreshAll} disabled={loading}>Refresh</button>
			<button class="btn" onclick={() => fetchStatus({ connect: true, reset: true })} disabled={loading}>
				Reconnect
			</button>
		</div>
	</div>

	<div class="content">
		<section class="panel">
			<div class="panelHeader">
				<h2>
					Entities
					<span class="pill" style="margin-left: 8px">{entitiesFiltered.length}</span>
				</h2>
				<div class="row" style="gap: 8px">
					<input class="input" placeholder="Filter (name, type, observation…)" bind:value={filter} />
				</div>
			</div>
			<div class="list">
				{#if loading && !graph}
					<div class="panelBody" style="color: var(--muted)">Loading graph…</div>
				{:else if graphError}
					<div class="panelBody" style="color: var(--danger)">
						<div style="font-weight: 600">Couldn’t load graph</div>
						<div style="margin-top: 6px; font-family: var(--mono); font-size: 12px">{graphError}</div>
						<div style="margin-top: 10px; color: var(--muted); font-size: 12px">
							Make sure your Memory MCP command is set (e.g. `MEMORY_MCP_COMMAND`) and works on this machine.
						</div>
					</div>
				{:else if !graph || !graph.entities.length}
					<div class="panelBody" style="color: var(--muted)">No entities found.</div>
				{:else}
					{#each entitiesFiltered as e (e.name)}
						<button
							type="button"
							class={"item " + (selectedName === e.name ? 'active' : '')}
							onclick={() => (selectedName = e.name)}
						>
							<div class="itemTitle">{e.name}</div>
							<div class="itemMeta">
								{#if e.entityType}<span>{e.entityType}</span>{/if}
								{#if (e.observations?.length ?? 0) > 0}<span>{e.observations?.length} obs</span>{/if}
								<span>{(relationsByFrom.get(e.name)?.length ?? 0) + (relationsByTo.get(e.name)?.length ?? 0)} links</span>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</section>

		<section class="panel">
			<div class="panelHeader">
				<h2>Details</h2>
				{#if graph}
					<span class="pill">{graph.entities.length} entities · {graph.relations.length} relations</span>
				{/if}
			</div>
			<div class="panelBody">
				<details style="margin-bottom: 14px" open>
					<summary style="cursor: pointer; color: var(--muted)">Connection</summary>
					<div style="margin-top: 10px" class="code">
						{#if status?.config}
							command: {status.config.command}{status.config.args?.length ? ' ' + status.config.args.join(' ') : ''}
						{:else}
							command: —
						{/if}
						{'\n'}connected: {status?.connected ? 'yes' : 'no'}
						{#if status?.connection}
							{'\n'}pid: {status.connection.pid ?? '—'}
							{'\n'}serverVersion: {JSON.stringify(status.connection.serverVersion ?? null)}
							{#if status.connection.lastError}{'\n'}lastError: {status.connection.lastError}{/if}
						{/if}
					</div>
					{#if status?.connection?.stderrTail?.length}
						<details style="margin-top: 10px">
							<summary style="cursor: pointer; color: var(--muted)">Server stderr (tail)</summary>
							<div style="margin-top: 10px" class="code">{status.connection.stderrTail.join('\n')}</div>
						</details>
					{/if}
				</details>

				{#if actionError}
					<div style="color: var(--danger); margin-bottom: 10px; font-family: var(--mono); font-size: 12px">
						{actionError}
					</div>
				{/if}

				{#if statusError}
					<div style="color: var(--danger); margin-bottom: 10px; font-family: var(--mono); font-size: 12px">
						{statusError}
					</div>
				{/if}

				{#if !selectedEntity}
					<div style="color: var(--muted)">Select an entity to inspect it.</div>
				{:else}
					<div class="row" style="justify-content: flex-end; margin-bottom: 12px">
						<button class="btn" onclick={openRename} disabled={actionBusy}>Rename</button>
						<button class="btn danger" onclick={() => deleteEntity(selectedEntity.name)} disabled={actionBusy}>
							Delete
						</button>
					</div>

					{#if renameOpen}
						<div class="panel" style="margin-bottom: 12px">
							<div class="panelHeader">
								<h2>Rename Entity</h2>
								<div class="row">
									<button class="btn" onclick={() => (renameOpen = false)} disabled={actionBusy}>Cancel</button>
									<button
										class="btn primary"
										onclick={() => renameEntity(selectedEntity.name, renameToName, renameToType)}
										disabled={actionBusy}
									>
										Apply
									</button>
								</div>
							</div>
							<div class="panelBody">
								<div class="row">
									<input class="input grow" placeholder="New name" bind:value={renameToName} />
								</div>
								<div class="row" style="margin-top: 8px">
									<input class="input grow" placeholder="Type (optional)" bind:value={renameToType} />
								</div>
								<div style="margin-top: 8px; color: var(--muted); font-size: 12px">
									Type is applied to the new entity. Leave blank to keep the current type.
								</div>
							</div>
						</div>
					{/if}

					<div class="kv">
						<div class="k">Name</div>
						<div style="font-family: var(--mono)">{selectedEntity.name}</div>

						<div class="k">Type</div>
						<div>{selectedEntity.entityType ?? '—'}</div>

						<div class="k">Observations</div>
						<div>
							{#if (selectedEntity.observations?.length ?? 0) === 0}
								<span style="color: var(--muted)">—</span>
							{:else}
								<div style="display: grid; gap: 8px">
									{#each selectedEntity.observations ?? [] as obs, i (obs)}
										{#if editingObsIndex === i}
											<div class="code">
												<textarea
													class="input"
													style="min-height: 78px; font-family: var(--mono); font-size: 12px"
													bind:value={editingObsValue}
												></textarea>
												<div class="row" style="justify-content: flex-end; margin-top: 8px">
													<button class="btn" onclick={cancelEditObservation} disabled={actionBusy}>Cancel</button>
													<button
														class="btn primary"
														onclick={() => saveEditObservation(selectedEntity.name, obs, editingObsValue)}
														disabled={actionBusy}
													>
														Save
													</button>
												</div>
											</div>
										{:else}
											<div class="code">
												<div style="white-space: pre-wrap">{obs}</div>
												<div class="row" style="justify-content: flex-end; margin-top: 8px">
													<button class="btn" onclick={() => startEditObservation(i, obs)} disabled={actionBusy}>
														Edit
													</button>
													<button
														class="btn danger"
														onclick={() => deleteObservation(selectedEntity.name, obs)}
														disabled={actionBusy}
													>
														Delete
													</button>
												</div>
											</div>
										{/if}
									{/each}
								</div>
							{/if}

							<div class="row" style="margin-top: 10px">
								<input class="input grow" placeholder="Add new observation…" bind:value={newObservation} />
								<button
									class="btn primary"
									onclick={() => addObservation(selectedEntity.name, newObservation)}
									disabled={actionBusy}
								>
									Add
								</button>
							</div>
						</div>

						<div class="k">Outgoing</div>
						<div>
							{#if (relationsByFrom.get(selectedEntity.name)?.length ?? 0) === 0}
								<span style="color: var(--muted)">—</span>
							{:else}
								<div class="code">
									{#each relationsByFrom.get(selectedEntity.name) ?? [] as r (r.relationType + r.to)}
										<div>
											<span style="color: var(--muted)">{r.relationType}</span>
											<button
												type="button"
												class="btn"
												style="margin-left: 8px; padding: 2px 8px; border-radius: 999px"
												onclick={() => (selectedName = r.to)}
											>
												{r.to}
											</button>
										</div>
									{/each}
								</div>
							{/if}
						</div>

						<div class="k">Incoming</div>
						<div>
							{#if (relationsByTo.get(selectedEntity.name)?.length ?? 0) === 0}
								<span style="color: var(--muted)">—</span>
							{:else}
								<div class="code">
									{#each relationsByTo.get(selectedEntity.name) ?? [] as r (r.relationType + r.from)}
										<div>
											<button
												type="button"
												class="btn"
												style="padding: 2px 8px; border-radius: 999px"
												onclick={() => (selectedName = r.from)}
											>
												{r.from}
											</button>
											<span style="color: var(--muted); margin-left: 8px">{r.relationType}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<details style="margin-top: 14px">
						<summary style="cursor: pointer; color: var(--muted)">Raw graph payload</summary>
						<div style="margin-top: 10px" class="code">{JSON.stringify(graph?.raw ?? null, null, 2)}</div>
					</details>
				{/if}
			</div>
		</section>
	</div>
</div>
