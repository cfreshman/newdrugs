export const DINDER_PAGES=['about','calendar','settings','matches','preferences','catalog'] as const;
export const isDinderPage=(value:unknown)=>DINDER_PAGES.some(page=>page===value);
