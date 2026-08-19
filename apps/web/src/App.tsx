import type { GroupSummary } from '@groupchat/contracts';
import { useCallback, useEffect, useState } from 'react';

import { api } from './api/client';
import { AuthForm } from './components/AuthForm';
import { ChatPanel } from './components/ChatPanel';
import { GroupSidebar } from './components/GroupSidebar';
import { useAuth } from './auth/AuthContext';

export function App(): JSX.Element {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  const loadGroups = useCallback(async () => {
    const list = await api.listGroups();
    setGroups(list);
    // Select the first group on initial load so the app opens on content
    // rather than an empty pane.
    setActiveGroupId((current) => current ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setActiveGroupId(null);
      return;
    }
    void loadGroups();
  }, [user, loadGroups]);

  if (!user) {
    return <AuthForm />;
  }

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;

  return (
    <div className="layout">
      <GroupSidebar
        groups={groups}
        activeGroupId={activeGroupId}
        onSelect={setActiveGroupId}
        onGroupCreated={() => void loadGroups()}
      />
      {activeGroup ? (
        // Keyed by group so switching rooms remounts with clean state rather
        // than leaking the previous group's messages into the new one.
        <ChatPanel key={activeGroup.id} group={activeGroup} />
      ) : (
        <section className="chat chat--empty">
          <p>Select a group, or create one to start chatting.</p>
        </section>
      )}
    </div>
  );
}
