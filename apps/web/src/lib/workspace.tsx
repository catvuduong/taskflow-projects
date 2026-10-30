'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Member } from './types';

// Who the viewer is acting as. There is no login, so this picks the member credited for comments and activity.
const STORAGE_KEY = 'taskflow-acting-as';

interface Workspace {
  members: Member[];
  actingAs: Member | undefined;
  setActingAs: (memberId: number) => void;
}

const WorkspaceContext = createContext<Workspace>({
  members: [],
  actingAs: undefined,
  setActingAs: () => undefined,
});

function readStoredId(): number | null {
  try {
    const id = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ members, children }: { members: Member[]; children: ReactNode }) {
  const [storedId, setStoredId] = useState<number | null>(readStoredId);
  const actingAs = members.find((member) => member.id === storedId) ?? members[0];

  function setActingAs(memberId: number) {
    setStoredId(memberId);
    try {
      localStorage.setItem(STORAGE_KEY, String(memberId));
    } catch {
      // Private mode can block storage. The choice then lasts for this page view only.
    }
  }

  return (
    <WorkspaceContext value={{ members, actingAs, setActingAs }}>{children}</WorkspaceContext>
  );
}

export function useWorkspace(): Workspace {
  return useContext(WorkspaceContext);
}
