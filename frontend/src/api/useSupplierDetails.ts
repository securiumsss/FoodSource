import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupplierDetailResponse, SupplierWorkspaceState } from '@food-suppliers/shared';
import { fetchSupplierById } from './client';

type Entry = { detail: SupplierDetailResponse } | { error: unknown };

const noIds: readonly string[] = [];

export function useSupplierDetails(id: string | null, region?: string, maxMoqRub?: number, visibleIds = noIds) {
  const key = id === null ? null : JSON.stringify([id, region, maxMoqRub]);
  const [entries, setEntries] = useState(() => new Map<string, Entry>());
  const pending = useRef(new Map<string, Promise<void>>());
  const cachedKeys = useRef(new Set<string>());
  const workspaceWrites = useRef(new Map<string, SupplierWorkspaceState>());

  const load = useCallback((id: string, region?: string, maxMoqRub?: number, prefetch = false) => {
    const key = JSON.stringify([id, region, maxMoqRub]);
    const inFlight = pending.current.get(key);
    if (inFlight) return inFlight;
    if (prefetch && cachedKeys.current.has(key)) return Promise.resolve();
    const requests = pending.current;
    const writes = workspaceWrites.current;
    const workspaceAtStart = writes.get(id);

    // Retry a failed load without hiding any cached content.
    setEntries(current => {
      const entry = current.get(key);
      if (!entry || 'detail' in entry) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });

    const request = fetchSupplierById(id, { region, maxMoqRub }).then(result => {
      const latestWorkspace = writes.get(id);
      // A read started before a save must not roll back its confirmed changes.
      const detail = latestWorkspace && latestWorkspace !== workspaceAtStart
        ? { ...result, workspace: latestWorkspace }
        : result;
      cachedKeys.current.add(key);
      setEntries(current => new Map(current).set(key, { detail }));
    }).catch(error => {
      setEntries(current => {
        const entry = current.get(key);
        return entry && 'detail' in entry ? current : new Map(current).set(key, { error });
      });
    }).finally(() => { requests.delete(key); });
    requests.set(key, request);
    return request;
  }, []);

  useEffect(() => {
    if (id !== null) void load(id, region, maxMoqRub);
  }, [id, load, region, maxMoqRub]);

  useEffect(() => {
    if (!visibleIds.length) return;
    let cancelled = false;
    let next = 0;
    async function warmPage() {
      // Keep background work below the request budget even across rapid page changes.
      while (!cancelled && next < visibleIds.length) {
        if (pending.current.size >= 2) {
          await Promise.race(pending.current.values());
        } else {
          await load(visibleIds[next++], region, maxMoqRub, true);
        }
      }
    }
    const timer = window.setTimeout(() => { void warmPage(); void warmPage(); }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [visibleIds, load, region, maxMoqRub]);

  const updateWorkspace = useCallback((supplierId: string, workspace: SupplierWorkspaceState) => {
    workspaceWrites.current.set(supplierId, workspace);
    setEntries(current => {
      const next = new Map(current);
      for (const [cachedKey, entry] of current) {
        if ('detail' in entry && entry.detail.id === supplierId) {
          next.set(cachedKey, { detail: { ...entry.detail, workspace } });
        }
      }
      return next;
    });
  }, []);

  const entry = key === null ? undefined : entries.get(key);
  return {
    detail: entry && 'detail' in entry ? entry.detail : null,
    loadError: entry && 'error' in entry ? entry.error : undefined,
    updateWorkspace,
  };
}
