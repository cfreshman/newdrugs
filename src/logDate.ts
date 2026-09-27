/** Calendar dates are local days, never UTC instants. */
const formatter=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
export const logDateLabel=(date:string)=>formatter.format(new Date(`${date}T12:00:00`)).toUpperCase();
