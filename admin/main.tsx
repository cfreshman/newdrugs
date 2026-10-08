import {Users} from './Users';
import {AgentModel} from './AgentModel';
import {adminRequest as request} from './api';
import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { SignOut } from '@phosphor-icons/react';
import './style.css';

interface Session { configured: boolean; owner: { id: string; username: string } | null; canSetup: boolean; stage: string }
interface Pool { budgetNanos: number; grantedNanos: number; remainingNanos: number; grants: { id: string; stage: string; amountNanos: number; createdAt: string }[] }
const dollars = (nanos: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(nanos / 1e9);
function Admin() {
  const [section,setSection]=useState<'users'|'credit'|'model'>('users');
  const [session, setSession] = useState<Session | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [budget, setBudget] = useState('100');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => {
    const next = await request<Session>('/session'); setSession(next);
    if (next.owner) { const value = await request<Pool>('/starter-pool'); setPool(value); setBudget(String(value.budgetNanos / 1e9)); }
  };
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true); const form = new FormData(event.currentTarget);
    try { await request('/login', { username: form.get('username'), password: form.get('password') }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed.'); } finally { setBusy(false); }
  };
  const saveBudget = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await request('/starter-pool', { budgetDollars: Number(budget) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update the budget.'); } finally { setBusy(false); }
  };
  return <main>
    <header><a href="/">New Drugs</a>{session?.owner && <button aria-label="Sign out of admin" onClick={async () => { await request('/logout', {}); setPool(null); await load(); }}><SignOut size={21} />Sign out</button>}</header>
    {session?.owner&&<nav className="admin-tabs" aria-label="Admin sections"><button aria-pressed={section==='users'} onClick={()=>setSection('users')}>Users</button><button aria-pressed={section==='credit'} onClick={()=>setSection('credit')}>Starter credit</button><button aria-pressed={section==='model'} onClick={()=>setSection('model')}>Agent model</button></nav>}
    {!session?.owner ? <section className="signin">
      <h1>{session && !session.configured ? 'Create owner account' : 'Admin sign-in'}</h1>
      {session && !session.configured && !session.canSetup ? <p>First setup is available from your trusted local dev connection.</p> : <form onSubmit={signIn}>
        <label>Username<input name="username" autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={40} pattern="[a-z0-9_]+" /></label>
        <label>Password<input name="password" type="password" autoComplete={session?.configured ? 'current-password' : 'new-password'} required minLength={8} maxLength={128} /></label>
        <button className="primary" disabled={busy || !session}>{busy ? 'Signing in…' : session?.configured ? 'Sign in' : 'Create owner account'}</button>
      </form>}
    </section> : section==='users'?<Users key={session.owner.id}/>:section==='model'?<AgentModel key={session.owner.id}/>:pool && <>
      <h1>Starter credit</h1><p>One shared pool for production and dev. Each new user receives $1 once, while funds remain.</p>
      <dl className="totals"><div><dt>Budget</dt><dd>{dollars(pool.budgetNanos)}</dd></div><div><dt>Granted</dt><dd>{dollars(pool.grantedNanos)}</dd></div><div><dt>Remaining</dt><dd>{dollars(pool.remainingNanos)}</dd></div></dl>
      <form className="budget" onSubmit={saveBudget}><label>Total budget ($)<input type="number" min={pool.grantedNanos / 1e9} max="100000" step="0.01" inputMode="decimal" required value={budget} onChange={e => setBudget(e.target.value)} /></label><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Update budget'}</button></form>
      <p className="note">This controls starter-credit allowances. It does not charge a card. Granted credit is reserved for those users; provider charges happen as they use it.</p>
      <h2>Recent grants</h2><table><thead><tr><th>When</th><th>Stage</th><th>Credit</th></tr></thead><tbody>{pool.grants.map(grant => <tr key={grant.id}><td>{new Date(grant.createdAt).toLocaleString()}</td><td>{grant.stage}</td><td>{dollars(grant.amountNanos)}</td></tr>)}</tbody></table>
      {!pool.grants.length && <p>No grants yet.</p>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Admin />);
