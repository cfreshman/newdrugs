import {BillingActivity} from './BillingActivity';
import { useEffect, useState, type FormEvent } from 'react';
import type { Bootstrap, Profile } from '../shared/types';
import { api, post, operation, money, balanceLabel, errorText } from './api';
import type { PaymentQuote } from '../shared/paymentQuote';
import { ProfileEditor } from './ProfileEditor';
import { agentSetup,agentDeviceSetup } from '../shared/agentSetup';
import {NavLink} from './NavLink';

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
    <p><strong>New Drugs takes no cut.</strong></p>
    <div className="amounts" role="group" aria-label="Top-up amount">{[500, 1000, 2000].map(cents => <button key={cents} aria-pressed={amount === cents} onClick={() => setAmount(cents)}>${cents / 100}</button>)}</div>
    {quote && <dl className="checkout-quote"><div><dt>AI credit</dt><dd>{cents(quote.creditCents)}</dd></div><div><dt>Expected processing fee</dt><dd>{cents(quote.processingCents)}</dd></div><div className="quote-total"><dt>Total</dt><dd>{cents(quote.totalCents)}</dd></div></dl>}
    <button className="solid wide" onClick={buy} disabled={busy || !data.config.paymentsEnabled || !quote}>{busy ? 'Opening checkout…' : quote ? `Pay ${cents(quote.totalCents)}, add ${cents(quote.creditCents)}` : 'Add credit'}</button>
    {!data.config.paymentsEnabled && <p className="quiet small">Payments aren’t connected yet.</p>}
    <p className="quiet small">Or use your own <NavLink className="text-link" to={{view:'agents'}} navigate={onConnect}>Codex, Claude Code, or other agent</NavLink> for <strong>free</strong>.</p>
    {data.wallet.reservedNanos > 0 && <p className="quiet small">{money(data.wallet.reservedNanos)} is held for your current reply. Any unused amount returns when it finishes.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <BillingActivity key={data.user.id} wallet={data.wallet}/>
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
        <label>Handle<input name="handle" required minLength={3} maxLength={24} pattern={mode==='register'?'(?![uU]_)[a-zA-Z0-9_]{3,24}':'[a-zA-Z0-9_]{3,24}'} title={mode==='register'?'Usernames cannot begin with u_.':undefined} autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
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
  const [promptCopied, setPromptCopied] = useState(false);
  const [showPromptFallback,setShowPromptFallback]=useState(false);
  const [deviceCopied,setDeviceCopied]=useState(false);
  const [expiry, setExpiry] = useState('');
  const setup = agentSetup(window.location.origin, secret);
  const load = async () => { const result = await api<{ tokens: Token[] }>('/tokens'); setTokens(result.tokens); };
  useEffect(() => { void load().catch(e => setError(errorText(e))); }, []);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    let finishClipboard:((text:string)=>void)|undefined,rejectClipboard:(()=>void)|undefined,earlyCopy:Promise<boolean>|undefined;
    if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
      const deferred=new Promise<Blob>((resolve,reject)=>{finishClipboard=text=>resolve(new Blob([text],{type:'text/plain'}));rejectClipboard=()=>reject(Error('Token creation failed.'));});
      void deferred.catch(()=>{});
      try{earlyCopy=navigator.clipboard.write([new ClipboardItem({'text/plain':deferred})]).then(()=>true,()=>false);}
      catch{rejectClipboard?.();earlyCopy=undefined;}
    }
    try {
      const days = expiry === 'custom' ? Number(form.get('customExpiry')) : expiry ? Number(expiry) : null;
      const result = await post<{ token: string }>('/tokens', { name: String(form.get('name') || '').trim() || 'My AI agent', scope: form.get('scope'), expiresInDays: days });
      setSecret(result.token);setPromptCopied(false);setShowPromptFallback(false);
      const prompt=agentSetup(window.location.origin,result.token).prompt;finishClipboard?.(prompt);
      let copied=earlyCopy?await earlyCopy:false;
      if(!copied)try{await navigator.clipboard.writeText(prompt);copied=true;}catch{/* The prompt remains available below. */}
      if(copied)setPromptCopied(true);
      else{setShowPromptFallback(true);setError('Connection created, but copying was blocked. Copy the setup prompt below.');}
      await load();
    } catch (e) { rejectClipboard?.(); setError(errorText(e)); } finally { setBusy(false); }
  };
  return <>
    <p>Use New Drugs from Codex, Claude Code, or another agent. Direct app actions are <strong>free</strong>.</p>
    <p>Create a connection, then paste the copied setup prompt into your agent. It will install the CLI and connect for you.</p>
    {!registered ? <NavLink className="solid wide" to={{view:'profile'}} navigate={onAccount}>Save your account first</NavLink> : <form className="fields" onSubmit={create}>
      <label>Connection name<input name="name" placeholder="My AI agent" maxLength={60} /></label>
      <label>Access<select name="scope" defaultValue="write"><option value="write">Read and take actions for me</option><option value="read">Read only</option></select></label>
      <label>Expires<select name="expiresInDays" value={expiry} onChange={event => setExpiry(event.target.value)}><option value="">No expiry</option><option value="7">After 7 days</option><option value="30">After 30 days</option><option value="90">After 90 days</option><option value="365">After one year</option><option value="custom">Choose a number of days</option></select></label>
      {expiry === 'custom' && <label>Days until expiry<input name="customExpiry" type="number" min={1} max={3650} required defaultValue={30} /></label>}
      <button className="solid" disabled={busy}>{busy ? 'Connecting…' : 'Create token and copy prompt'}</button>
    </form>}
    {secret && <section className="connection-setup" aria-label="Agent setup">
      {promptCopied?<p>Setup prompt copied. Paste it into your agent. <button type="button" className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(setup.prompt);}catch{setShowPromptFallback(true);setError('Select the setup prompt and copy it manually.');}}}>Copy again</button></p>
       :<button type="button" className="solid wide" onClick={async () => { try { await navigator.clipboard.writeText(setup.prompt); setPromptCopied(true);setShowPromptFallback(false);setError(''); } catch { setShowPromptFallback(true);setError('Select the setup prompt and copy it manually.'); } }}>Copy setup prompt</button>}
      <p className="quiet small">The prompt includes your token. Paste it only into an agent you trust.</p>
      {showPromptFallback&&<pre className="setup-prompt" tabIndex={0} aria-label="Setup prompt">{setup.prompt}</pre>}
    </section>}
    <details className="device-login-option"><summary>Browser approval for a cloud agent</summary><p>Use this optional setup when your agent runs on another computer. It gives you an approval link and code, then saves its credentials automatically.</p><pre className="setup-prompt">{agentDeviceSetup(window.location.origin)}</pre><button type="button" className="solid wide" onClick={async()=>{try{await navigator.clipboard.writeText(agentDeviceSetup(window.location.origin));setDeviceCopied(true);setTimeout(()=>setDeviceCopied(false),2000);}catch{setError('Select the setup prompt and copy it manually.');}}}>{deviceCopied?'Copied':'Copy device setup prompt'}</button></details>
    {tokens.length > 0 && <ul className="token-list">{tokens.map(token => <li key={token.id}><span>{token.name}<small>{token.scope === 'read' ? 'Read only' : 'Read & write'} · {token.expiresAt ? `until ${new Date(token.expiresAt).toLocaleDateString()}` : 'No expiry'}</small></span>
      <button className="text-link" onClick={async () => { try { await api(`/tokens/${token.id}`, { method: 'DELETE' }); setSecret('');setShowPromptFallback(false); await load(); } catch (e) { setError(errorText(e)); } }}>Revoke</button></li>)}</ul>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
