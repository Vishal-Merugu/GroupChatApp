import type { GroupSummary, MessageDto } from '@groupchat/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useChatSocket } from '../socket/useChatSocket';

interface ChatPanelProps {
  group: GroupSummary;
}

export function ChatPanel({ group }: ChatPanelProps): JSX.Element {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const handleIncoming = useCallback((message: MessageDto) => {
    setMessages((current) => {
      // The sender receives its own broadcast too, and history may overlap a
      // live message that arrived mid-fetch — dedupe by id rather than assuming.
      if (message.groupId !== group.id || current.some((m) => m.id === message.id)) {
        return current;
      }
      return [...current, message];
    });
  }, [group.id]);

  const { connected, typingUsers, onlineUserIds, sendMessage, notifyTyping } = useChatSocket({
    token,
    groupId: group.id,
    onMessage: handleIncoming,
  });

  // Load history whenever the active group changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);

    api
      .listMessages(group.id)
      .then((history) => {
        if (!cancelled) {
          setMessages(history);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : 'Could not load messages');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [group.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(event: FormEvent): Promise<void> {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      return;
    }

    setDraft('');
    setError(null);

    const result = await sendMessage(body);
    if (!result.ok) {
      setError(result.error);
      // Restore the draft so a rejected message is not silently lost.
      setDraft(body);
    }
  }

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) {
      return null;
    }
    if (typingUsers.length === 1) {
      return `${typingUsers[0]} is typing…`;
    }
    return `${typingUsers.join(', ')} are typing…`;
  }, [typingUsers]);

  return (
    <section className="chat">
      <header className="chat__header">
        <div>
          <h2 className="chat__title">{group.name}</h2>
          <span className="chat__presence">
            {onlineUserIds.length} online
          </span>
        </div>
        <span className={connected ? 'status status--on' : 'status status--off'}>
          {connected ? 'live' : 'connecting…'}
        </span>
      </header>

      <div className="chat__messages">
        {loading && <p className="chat__empty">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="chat__empty">No messages yet. Say something.</p>
        )}
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} isOwn={message.author.id === user?.id} />
        ))}
        <div ref={bottomRef} />
      </div>

      {typingLabel && <div className="chat__typing">{typingLabel}</div>}
      {error && <div className="chat__error">{error}</div>}

      <form className="composer" onSubmit={(event) => void handleSend(event)}>
        <input
          className="composer__input"
          value={draft}
          placeholder={`Message ${group.name}`}
          onChange={(event) => {
            setDraft(event.target.value);
            notifyTyping();
          }}
        />
        <button className="button" type="submit" disabled={!connected || draft.trim().length === 0}>
          Send
        </button>
      </form>
    </section>
  );
}

function MessageRow({ message, isOwn }: { message: MessageDto; isOwn: boolean }): JSX.Element {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className={isOwn ? 'message message--own' : 'message'}>
      <div className="message__meta">
        <span className="message__author">{message.author.name}</span>
        <span className="message__time">{time}</span>
      </div>
      {message.kind === 'file' && message.attachmentUrl ? (
        // Rendered as a real link with the filename as text — never as markup
        // parsed out of the message body, which is what the original did.
        <a className="message__file" href={message.attachmentUrl} target="_blank" rel="noreferrer">
          📎 {message.attachmentName ?? message.body}
        </a>
      ) : (
        <p className="message__body">{message.body}</p>
      )}
    </article>
  );
}
