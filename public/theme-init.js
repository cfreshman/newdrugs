/* Apply the cached choice before the app paints; the signed-in account remains authoritative. */
(()=>{try{const mode=localStorage.getItem('nd-appearance')||'light';const dark=mode==='dark'||mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';}catch{document.documentElement.dataset.theme='light';}})();

(()=>{try{const font=localStorage.getItem('nd-font');document.documentElement.dataset.font=['mono','sans','serif'].includes(font)?font:'mono';}catch{document.documentElement.dataset.font='mono';}})();
