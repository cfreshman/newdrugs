import {LocationLabel,useLocationLabel} from './LocationLabel';
import { useEffect, useRef, useState } from 'react';
import { NavigationArrow, X } from '@phosphor-icons/react';
import { operation, errorText } from './api';
import { nearestCoarseCell, type CoarseArea } from '../shared/geo';

type Place = { id: string; label: string; cell: string };
export function LocationPicker({ value, onChange }: { value: CoarseArea | null; onChange(area: CoarseArea | null): void }) {
  const savedLabel=useLocationLabel(value?.label);
  const [query, setQuery] = useState(''), [places, setPlaces] = useState<Place[]>([]), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) { setPlaces([]); return; }
    const timer = setTimeout(() => { void operation<{ items: Place[] }>('locations.search', { query: query.trim() })
      .then(result => { if (!cancelled) setPlaces(result.items); }).catch(e => { if (!cancelled) setError(errorText(e)); }); }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  const choose = async (cell: string, request = ++generation.current) => {
    setBusy(true); setError('');
    try { const area = await operation<CoarseArea>('locations.resolve', { cell }); if (request === generation.current) { onChange(area); setQuery(''); setPlaces([]); } }
    catch (e) { if (request === generation.current) setError(errorText(e)); }
    finally { if (request === generation.current) setBusy(false); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setError('Location is unavailable in this browser. Search for your town instead.'); return; }
    const request = ++generation.current; setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== generation.current) return;
      // Raw GPS never enters an API request, storage, or application state.
      void choose(nearestCoarseCell(position.coords.latitude, position.coords.longitude), request);
    }, () => { if (request === generation.current) { setBusy(false); setError('Location was unavailable. You can search for your town.'); } }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 });
  };
  return <div className="location-picker">
    <label>Approximate area<input type="search" value={query} placeholder={savedLabel || 'Search for a town or city'} maxLength={100} autoComplete="off" onChange={event => { setQuery(event.target.value); setError(''); }} /></label>
    {places.length > 0 && <ul className="place-results">{places.map(place => <li key={place.id}><button type="button" disabled={busy} onClick={() => void choose(place.cell)}><LocationLabel label={place.label}/></button></li>)}</ul>}
    <div className="location-actions"><button type="button" className="text-link" disabled={busy} onClick={locate}><NavigationArrow size={16} />{busy ? 'Finding your area…' : 'Use my location'}</button>
      {value && <button type="button" className="text-link" aria-label="Remove saved area" onClick={() => { generation.current++; setBusy(false); onChange(null); }}><X size={16} />Clear</button>}</div>
    {value && <p className="small"><LocationLabel label={value.label}/></p>}
    <p className="quiet small">Only an approximate area is shared.</p>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
