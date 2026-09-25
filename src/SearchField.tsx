import { useState, type FormEvent } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
export function SearchField({ label, value, onSearch }: { label: string; value: string; onSearch(value: string): void }) {
  const [draft, setDraft] = useState(value);
  const submit = (event: FormEvent) => { event.preventDefault(); onSearch(draft.trim()); };
  return <form className="discovery-search" role="search" onSubmit={submit}><label className="sr-only" htmlFor={`search-${label}`}>{label}</label><input id={`search-${label}`} type="search" value={draft} maxLength={500} placeholder={label} onChange={event=>setDraft(event.target.value)} />{draft && <button type="button" className="search-control search-clear" aria-label="Clear search" onClick={()=>{setDraft('');onSearch('');}}><X size={18}/></button>}<button type="submit" className="search-control search-submit" aria-label={label}><MagnifyingGlass size={19}/></button></form>;
}
