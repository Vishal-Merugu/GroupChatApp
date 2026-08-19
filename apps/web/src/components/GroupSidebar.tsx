import type { GroupSummary } from '@groupchat/contracts';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ProviderSettings } from './ProviderSettings';

interface GroupSidebarProps {
  groups: GroupSummary[];
  activeGroupId: number | null;
  onSelect: (groupId: number) => void;
  onGroupCreated: () => void;
}

export function GroupSidebar(props: GroupSidebarProps): JSX.Element {
  const { user, logout } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showProviders, setShowProviders] = useState(false);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await api.createGroup({
        name,
        // Comma-separated emails; blanks stripped so a trailing comma is fine.
        members: members
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
        admins: [],
      });
      setName('');
      setMembers('');
      setCreating(false);
      props.onGroupCreated();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the group');
    }
  }

  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <div>
          <div className="sidebar__user">{user?.name}</div>
          <div className="sidebar__email">{user?.email}</div>
        </div>
        <div className="sidebar__headerActions">
          <button className="button button--ghost" type="button" onClick={() => setShowProviders(true)}>
            AI Providers
          </button>
          <button className="button button--ghost" type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {showProviders && <ProviderSettings onClose={() => setShowProviders(false)} />}

      <nav className="sidebar__list">
        {props.groups.length === 0 && (
          <p className="sidebar__empty">No groups yet. Create one to get started.</p>
        )}
        {props.groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={
              group.id === props.activeGroupId ? 'group group--active' : 'group'
            }
            onClick={() => props.onSelect(group.id)}
          >
            <span className="group__name">{group.name}</span>
            {group.isAdmin && <span className="group__badge">admin</span>}
          </button>
        ))}
      </nav>

      <footer className="sidebar__footer">
        {creating ? (
          <form onSubmit={(event) => void handleCreate(event)} className="sidebar__form">
            <input
              placeholder="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              placeholder="Member emails, comma separated"
              value={members}
              onChange={(e) => setMembers(e.target.value)}
            />
            {error && <span className="field__error">{error}</span>}
            <div className="sidebar__formActions">
              <button className="button" type="submit">
                Create
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="button" type="button" onClick={() => setCreating(true)}>
            New group
          </button>
        )}
      </footer>
    </aside>
  );
}
