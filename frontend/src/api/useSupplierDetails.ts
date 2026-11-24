import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupplierDetailResponse, SupplierWorkspaceState } from '@food-suppliers/shared';
import { fetchSupplierById } from './client';

type Entry = { detail: SupplierDetailResponse } | { error: unknown };

export function useSupplierDetails(id: string | null, region?: string, maxMoqRub?: number) {
  const key = id === null ? null : JSON.stringify([id, region, maxMoqRub]);
  const [entries, setEntries] = useState(() => new Map<string, Entry>());
  const pending = useRef(new Set<string>());
  const workspaceWrites = useRef(new Map<string, SupplierWorkspaceState>());

  useEffect(() => {
    if (id === null || key === null || pending.current.has(key)) return;
    const requests = pending.current;
    const writes = workspaceWrites.current;
    const workspaceAtStart = writes.get(id);
    requests.add(key);

    // Retry a failed load without hiding any cached content.
    setEntries(current => {
      const entry = current.get(key);
      if (!entry || 'detail' in entry) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });

    void fetchSupplierById(id, { region, maxMoqRub }).then(result => {
      const latestWorkspace = writes.get(id);
      // A read started before a save must not roll back its confirmed changes.
      const detail = latestWorkspace && latestWorkspace !== workspaceAtStart
        ? { ...result, workspace: latestWorkspace }
        : result;
      setEntries(current => new Map(current).set(key, { detail }));
    }).catch(error => {
      setEntries(current => {
        const entry = current.get(key);
        return entry && 'detail' in entry ? current : new Map(current).set(key, { error });
      });
    }).finally(() => requests.delete(key));
  }, [id, key, region, maxMoqRub]);

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
