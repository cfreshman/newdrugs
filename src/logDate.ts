/** Calendar dates are local days, never UTC instants. Matches Logcal's item labels. */
export const logDateLabel=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).toUpperCase();
