import { CaretDown } from '@phosphor-icons/react';
export function RadiusSelect({value,onChange}:{value:number;onChange(value:number):void}) {
  return <span className="radius-select"><select aria-label="Search radius" value={value ?? 25} onChange={event=>onChange(Number(event.target.value))}>{[10,25,50,100,250].map(miles=><option key={miles} value={miles}>{miles} miles</option>)}</select><CaretDown size={14} weight="bold" aria-hidden="true"/></span>;
}
