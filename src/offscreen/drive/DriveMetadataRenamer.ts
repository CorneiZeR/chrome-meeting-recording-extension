import { DRIVE_FILES_URL } from './constants';
import { formatDriveError, readDriveErrorDetail } from './errors';
import { fetchWithAuthRetry, fetchWithTimeout, type TokenProvider } from './request';

export type DriveRenameResource = { id: string; name: string };

export class DriveRenameError extends Error {
  constructor(
    message: string,
    readonly currentResources: DriveRenameResource[],
    readonly rollbackIncomplete: boolean,
  ) {
    super(message);
    this.name = 'DriveRenameError';
  }
}

/** Renames Drive metadata sequentially and rolls completed changes back on failure. */
export async function renameDriveResources(
  getToken: TokenProvider,
  requested: DriveRenameResource[],
): Promise<DriveRenameResource[]> {
  const resources = uniqueResources(requested);
  const originals = await Promise.all(resources.map(async ({ id }) => ({
    id,
    name: await readDriveResourceName(getToken, id),
  })));
  const originalById = new Map(originals.map((resource) => [resource.id, resource.name]));
  const changed: DriveRenameResource[] = [];

  try {
    for (const resource of resources) {
      if (originalById.get(resource.id) === resource.name) continue;
      await patchDriveResourceName(getToken, resource.id, resource.name);
      changed.push(resource);
    }
    return resources;
  } catch (error) {
    let rollbackIncomplete = false;
    for (const resource of [...changed].reverse()) {
      try {
        await patchDriveResourceName(getToken, resource.id, originalById.get(resource.id)!);
      } catch {
        rollbackIncomplete = true;
      }
    }
    const currentResources = rollbackIncomplete
      ? await readCurrentNamesBestEffort(getToken, resources, originalById)
      : originals;
    const detail = error instanceof Error ? error.message : String(error);
    throw new DriveRenameError(
      rollbackIncomplete
        ? `Drive rename failed and some changes could not be rolled back: ${detail}`
        : `Drive rename failed; completed changes were rolled back: ${detail}`,
      currentResources,
      rollbackIncomplete,
    );
  }
}

function uniqueResources(resources: DriveRenameResource[]): DriveRenameResource[] {
  const byId = new Map<string, DriveRenameResource>();
  for (const resource of resources) {
    const id = resource.id.trim();
    const name = resource.name.trim();
    if (!id || !name) throw new Error('Drive rename requires non-empty ids and names');
    byId.set(id, { id, name });
  }
  return [...byId.values()];
}

function driveResourceUrl(id: string): string {
  const base = DRIVE_FILES_URL.split('?', 1)[0];
  return `${base}/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name`;
}

async function readDriveResourceName(getToken: TokenProvider, id: string): Promise<string> {
  const response = await fetchWithAuthRetry(getToken, (token) => fetchWithTimeout(driveResourceUrl(id), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  }));
  if (!response.ok) {
    throw new Error(formatDriveError('Drive metadata read failed', response.status, await readDriveErrorDetail(response)));
  }
  const body = await response.json().catch(() => null) as { name?: unknown } | null;
  if (typeof body?.name !== 'string' || !body.name) throw new Error(`Drive metadata read returned no name for ${id}`);
  return body.name;
}

async function patchDriveResourceName(getToken: TokenProvider, id: string, name: string): Promise<void> {
  const response = await fetchWithAuthRetry(getToken, (token) => fetchWithTimeout(driveResourceUrl(id), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }));
  if (!response.ok) {
    throw new Error(formatDriveError('Drive metadata update failed', response.status, await readDriveErrorDetail(response)));
  }
}

async function readCurrentNamesBestEffort(
  getToken: TokenProvider,
  resources: DriveRenameResource[],
  fallback: Map<string, string>,
): Promise<DriveRenameResource[]> {
  return await Promise.all(resources.map(async ({ id }) => {
    try {
      return { id, name: await readDriveResourceName(getToken, id) };
    } catch {
      return { id, name: fallback.get(id) ?? '' };
    }
  }));
}
