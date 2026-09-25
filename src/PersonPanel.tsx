import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Profile } from '../shared/types';
import { errorText, operation } from './api';
import { ProfileCard } from './ProfileCard';
import type { Destination } from '../shared/navigation';
import { useRecordRefresh } from './useRecordRefresh';
import { PersonSafety } from './PeopleSafety';
import { usePanelLoading } from './PanelReadiness';

interface Relationship { id: string; fromId: string; toId: string; note: string; status: 'pending' | 'accepted' | 'declined' | 'withdrawn' }
export function PersonPanel({ personId, user, navigate }: { personId: string; user: Profile; navigate(destination: Destination): void }) {
  const [person, setPerson] = useState<Profile | null>(null), [error, setError] = useState('');
  const [connection, setConnection] = useState<Relationship | null | undefined>(undefined), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  usePanelLoading(!person && !error);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const [person, relationship] = await Promise.all([operation<Profile>('people.get', { personId }), personId === user.id ? Promise.resolve({ connection: undefined }) : operation<{ connection: Relationship | null }>('connections.status', { personId })]);
      if (request === generation.current) { setPerson(person); setConnection(relationship.connection); setError(''); }
    } catch (error) { if (request === generation.current) { setPerson(null); setConnection(undefined); setError(errorText(error)); } }
  }, [personId, user.id]);
  useEffect(() => { setPerson(null); setConnection(undefined); setNote(''); void load(); return () => { generation.current++; }; }, [load]);
  useRecordRefresh(['people', 'connections'], load);
  const invite = async (event: FormEvent) => {
    event.preventDefault(); if (!note.trim() || busy) return; setBusy(true); setError('');
    try { const result = await operation<Relationship>('connections.request', { personId, note: note.trim() }, { confirmed: true }); generation.current++; setConnection(result); setNote(''); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  const respond = async (accept: boolean) => { if (!connection) return; setBusy(true); setError(''); try { const result = await operation<Relationship>('connections.respond', { connectionId: connection.id, accept }, { confirmed: true }); generation.current++; setConnection(result); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const withdraw = async () => { if (!connection) return; setBusy(true); try { await operation('connections.withdraw', { connectionId: connection.id }); await load(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  return <>{person && <><ProfileCard person={person} /><div className="profile-contact">
    {personId === user.id ? <button className="text-link" onClick={() => navigate({ view: 'profile' })}>Edit profile</button>
      : !user.handle ? <button className="solid" onClick={() => navigate({ view: 'profile' })}>Create an account to connect</button>
        : connection?.status === 'accepted' ? <button className="solid" onClick={() => navigate({ view: 'messages', resourceId: connection.id })}>Open messages</button>
          : connection?.status === 'pending' ? connection.toId === user.id ? <><p>{connection.note}</p><div className="review-buttons"><button disabled={busy} onClick={() => void respond(false)}>Decline</button><button disabled={busy} onClick={() => void respond(true)}>Accept invitation</button></div></> : <><p className="quiet">Invitation sent. Messages open when they accept.</p><button className="text-link" disabled={busy} onClick={() => void withdraw()}>Withdraw invitation</button></>
            : connection?.status === 'declined' ? <p className="quiet">This invitation was declined.</p>
              : connection === null || connection?.status === 'withdrawn' ? <form className="fields" onSubmit={invite}><label>Invitation note<textarea value={note} maxLength={500} rows={2} onChange={event => setNote(event.target.value)} /></label><button className="solid" disabled={busy || !note.trim()}>{busy ? 'Sending…' : 'Send invitation'}</button></form> : null}
  </div>{personId !== user.id && <PersonSafety personId={personId} label={person.handle ? `@${person.handle}` : person.name || 'this person'} navigate={navigate} />}</>}{error && <p className="error" role="alert">{error}</p>}</>;
}
