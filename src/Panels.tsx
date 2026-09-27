import { useEffect, useState, type FormEvent } from 'react';
import type { Bootstrap, Profile } from '../shared/types';
import { api, post, operation, money, balanceLabel, errorText } from './api';
import type { PaymentQuote } from '../shared/paymentQuote';
import { ProfileEditor } from './ProfileEditor';
import { agentSetup } from '../shared/agentSetup';

export function Credits({ data, onAccount, onConnect }: { data: Bootstrap; onAccount(): void; onConnect(): void }) {
  const [amount, setAmount] = useState(500);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quotes, setQuotes] = useState<PaymentQuote[]>([]);
  useEffect(() => { void api<{quotes:PaymentQuote[]}>('/checkout/quotes').then(result=>setQuotes(result.quotes)).catch(e=>console.error('Credit quote:',errorText(e))); }, []);
  const quote = quotes.find(q=>q.creditCents===amount);
  const starter = !data.user.handle ? data.wallet.starterAvailableNanos || 0 : 0;
  const cents = (value: number) => money(value * 10_000_000);
  const buy = async () => {
    if (!data.user.handle) { onAccount(); return; }
    setBusy(true); setError('');
    try {
      const { url } = await post<{ url: string }>('/checkout', { cents: amount, requestId: crypto.randomUUID() });
      const target = new URL(url);
      if (target.hostname !== 'checkout.stripe.com' || target.protocol !== 'https:') throw new Error('The checkout link could not be verified.');
      window.location.assign(target.href);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return <>
    <p className="balance">{balanceLabel(data.wallet.balanceNanos + starter)}</p>
    <p className="quiet balance-caption">{starter ? 'Starter credit available after signup' : 'Credit balance'}</p>
    <p><strong>New Drugs takes no cut.</strong> Your credit pays for AI at cost. No markup or subscription.</p>
    <div className="amounts" role="group" aria-label="Top-up amount">{[500, 1000, 2000].map(cents => <button key={cents} aria-pressed={amount === cents} onClick={() => setAmount(cents)}>${cents / 100}</button>)}</div>
    {quote && <dl className="checkout-quote"><div><dt>AI credit</dt><dd>{cents(quote.creditCents)}</dd></div><div><dt>Expected processing fee</dt><dd>{cents(quote.processingCents)}</dd></div><div className="quote-total"><dt>Total</dt><dd>{cents(quote.totalCents)}</dd></div></dl>}
    <button className="solid wide" onClick={buy} disabled={busy || !data.config.paymentsEnabled || !quote}>{busy ? 'Opening checkout…' : quote ? `Pay ${cents(quote.totalCents)}, add ${cents(quote.creditCents)}` : 'Add credit'}</button>
    {!data.config.paymentsEnabled && <p className="quiet small">Payments aren’t connected yet.</p>}
    <p className="quiet small">Or use your own <button type="button" className="text-link" onClick={onConnect}>Codex, Claude Code, or other agent</button> for <strong>free</strong>.</p>
    {data.wallet.reservedNanos > 0 && <p className="quiet small">{money(data.wallet.reservedNanos)} is held for your current reply. Any unused amount returns when it finishes.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <details className="details"><summary>Activity</summary>
      <p className="small quiet">Charges follow reported AI usage and may arrive after a reply. Balances are shown in cents; smaller charges appear below. Hosting is paid by us.</p>
      <ul className="ledger">{data.wallet.entries.map(entry => <li key={entry.id}>
        <div><span>{entry.label}</span><time>{new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></div>
        <span>{entry.amountNanos > 0 ? '+' : '−'}{money(Math.abs(entry.amountNanos), entry.amountNanos < 0)}</span>
      </li>)}</ul>
      {!data.wallet.entries.length && <p className="quiet">No charges yet.</p>}
    </details>
    {data.config.development && <p className="local-note">Development environment.</p>}
  </>;
}

export function Account({ data, refresh, close, saved: onSaved, initialMode = 'register', onModeChange, onboarding = false }: { data: Bootstrap; refresh(): Promise<void>; close(): void; saved(): void; initialMode?: 'register' | 'login'; onModeChange?(mode: 'register' | 'login'): void; onboarding?: boolean }) {
  const [mode, setMode] = useState<'register' | 'login'>(initialMode);
  useEffect(() => setMode(initialMode), [initialMode]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const result = await post<{ user: Profile }>(`/account/${mode}`, { handle: fields.get('handle'), password: fields.get('password') });
      await refresh();
      if (mode === 'login') {if(onboarding)onSaved();else close();}
    }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <>
    {!data.user.handle ? <>
      <p>{mode === 'register' ? 'Create an account to meet people, post, message, and use your agent.' : 'Sign in to your account.'}</p>
      <form className="fields" onSubmit={submit}>
        <label>Handle<input name="handle" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
        <label>Password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="At least 8 characters" /></label>
        {mode === 'register' && <p className="quiet small">Save this in your password manager. Password recovery isn’t available yet.</p>}
        <button className="solid" disabled={busy}>{busy ? 'Saving…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
      </form>
      <button className="text-link switch-account" onClick={() => { setError(''); const next = mode === 'register' ? 'login' : 'register'; setMode(next); onModeChange?.(next); }}>{mode === 'register' ? 'Already here? Sign in' : 'Make an account'}</button>
    </> : <>
      <ProfileEditor key={data.user.id} person={data.user} saved={async () => { await refresh(); onSaved(); }} />
      {onboarding && <button className="text-link profile-later" onClick={onSaved}>Set up my profile later</button>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

interface Token { id: string; name: string; scope: 'read' | 'write'; expiresAt: string | null }
export function Connections({ registered, onAccount }: { registered: boolean; onAccount(): void }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [expiry, setExpiry] = useState('');
  const setup = agentSetup(window.location.origin, secret);
  const load = async () => { const result = await api<{ tokens: Token[] }>('/tokens'); setTokens(result.tokens); };
  useEffect(() => { void load().catch(e => setError(errorText(e))); }, []);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const days = expiry === 'custom' ? Number(form.get('customExpiry')) : expiry ? Number(expiry) : null;
      const result = await post<{ token: string }>('/tokens', { name: String(form.get('name') || '').trim() || 'My AI agent', scope: form.get('scope'), expiresInDays: days });
      setSecret(result.token); setCopied(false); setPromptCopied(false); await load();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <>
    <p>Use New Drugs from Codex, Claude Code, or another agent. Direct app actions are <strong>free</strong>.</p>
    <p>Create a token, then paste the setup prompt below into your agent. It will install the CLI and connect for you.</p>
    {!registered ? <button className="solid wide" onClick={onAccount}>Save your account first</button> : <form className="fields" onSubmit={create}>
      <label>Connection name<input name="name" placeholder="My AI agent" maxLength={60} /></label>
      <label>Access<select name="scope" defaultValue="write"><option value="write">Read and take actions for me</option><option value="read">Read only</option></select></label>
      <label>Expires<select name="expiresInDays" value={expiry} onChange={event => setExpiry(event.target.value)}><option value="">No expiry</option><option value="7">After 7 days</option><option value="30">After 30 days</option><option value="90">After 90 days</option><option value="365">After one year</option><option value="custom">Choose a number of days</option></select></label>
      {expiry === 'custom' && <label>Days until expiry<input name="customExpiry" type="number" min={1} max={3650} required defaultValue={30} /></label>}
      <button className="solid" disabled={busy}>{busy ? 'Connecting…' : 'Create an access token'}</button>
    </form>}
    {secret && <div className="token-result"><label>Shown once. Keep it private.<input readOnly value={secret} aria-label="Access token" onFocus={e => e.target.select()} /></label>
      <button className="text-link" onClick={async () => { try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { setError('Select the token and copy it manually.'); } }}>{copied ? 'Copied' : 'Copy token'}</button></div>}
    <section className="connection-setup" aria-label="Agent setup">
      <button type="button" className="solid wide" disabled={!secret} onClick={async () => { try { await navigator.clipboard.writeText(setup.prompt); setPromptCopied(true); } catch { setError('Select the setup prompt and copy it manually.'); } }}>{promptCopied ? 'Setup prompt copied' : 'Copy setup prompt'}</button>
      <p className="quiet small">The prompt includes your token. Paste it only into an agent you trust.</p>
      <pre className="setup-prompt" tabIndex={0} aria-label="Setup prompt">{setup.prompt}</pre>
      <p className="small">For a manual connection, install the CLI and log in at its hidden token prompt:</p>
      <pre>npm install --global {setup.site}/downloads/newdrugs-cli.tgz{`\n`}newdrugs{setup.profile} login --url {setup.site}</pre>
      <p className="quiet small">MCP is optional. Its endpoint is <code>{setup.site}/mcp</code>, using your token as Bearer authentication.</p>
      <p className="quiet small">Connected agents can read your private chat and, with write access, act for you. Revoke access below whenever you want.</p>
    </section>
    {tokens.length > 0 && <ul className="token-list">{tokens.map(token => <li key={token.id}><span>{token.name}<small>{token.scope === 'read' ? 'Read only' : 'Read & write'} · {token.expiresAt ? `until ${new Date(token.expiresAt).toLocaleDateString()}` : 'No expiry'}</small></span>
      <button className="text-link" onClick={async () => { try { await api(`/tokens/${token.id}`, { method: 'DELETE' }); setSecret(''); await load(); } catch (e) { setError(errorText(e)); } }}>Revoke</button></li>)}</ul>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
