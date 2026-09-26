/** Standard US postal abbreviations, used only for the state portion of a US label. */
export const US_STATE_ABBREVIATIONS:Readonly<Record<string,string>> = {
  Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',Connecticut:'CT',Delaware:'DE',
  Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',
  Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',
  Nebraska:'NE',Nevada:'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',
  Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',
  Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY','District of Columbia':'DC',
};
const states=new Map(Object.entries(US_STATE_ABBREVIATIONS).map(([name,code])=>[name.toLowerCase(),code]));
const countries=new Set(['united states','united states of america','us','usa','u.s.','u.s.a.']);
/** Preserve locality names and international labels. Stored geography stays unchanged. */
export function formatLocationLabel(label:string|null|undefined,compactState=false):string {
  if(!label)return '';
  const displayLabel=label.replace(/ area(?=,|$)/,'');
  const parts=displayLabel.split(',').map(part=>part.trim());
  if(!countries.has(parts.at(-1)!.toLowerCase()))return displayLabel;
  parts[parts.length-1]='US';
  if(compactState&&parts.length>1){const index=parts.length-2;parts[index]=states.get(parts[index].toLowerCase())||parts[index];}
  return parts.join(', ');
}
