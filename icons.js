const paths = {
  back:'<path d="m15 5-7 7 7 7"/>',
  home:'<path d="m3 11 9-7 9 7v9H3z"/><path d="M9 20v-7h6v7"/>',
  mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/>',
  play:'<path d="m8 5 11 7-11 7z"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
  delete:'<path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6"/>',
  share:'<path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7"/>',
  flame:'<path d="M12 21a7 7 0 0 0 7-7c0-4-2-6-5-9 0 3-1 4-3 5-1-2-1-4-1-7-3 3-5 7-5 11a7 7 0 0 0 7 7z"/>',
  volume:'<path d="M4 9v6h4l5 4V5L8 9zM17 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/>',
  parent:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1m0-14.2L17 7M7 17l-2.1 2.1"/>'
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;

const iconArt = {
  headache:'<circle cx="31" cy="31" r="14"/><path d="M20 25l5 3-4 4 5 3m18-12-5 3 4 4-5 3M24 47h15"/>',
  fever:'<rect x="28" y="13" width="8" height="29" rx="4"/><circle cx="32" cy="44" r="7"/><path d="M32 25v19m-12-17h4m-4 7h4"/>',
  cough:'<path d="M21 42q-8-9 0-19q10-11 22-2M22 41q8 7 17 2m-5-17q7-6 13 0m-13 6q11-4 16 3m-17 4q10-1 15 6"/>',
  nurse:'<path d="M19 47V27q0-15 13-15t13 15v20M20 24h24M32 27v11m-6-5h12M18 48h28"/>',
  medicine:'<rect x="21" y="20" width="22" height="30" rx="3"/><path d="M25 14h14v6M32 29v12m-6-6h12"/>',
  appointment:'<rect x="15" y="19" width="34" height="32" rx="3"/><path d="M23 13v11m18-11v11M15 28h34m-26 9h6m6 0h6m-18 7h6"/>',
  thermometer:'<rect x="28" y="12" width="8" height="29" rx="4"/><circle cx="32" cy="44" r="7"/><path d="M32 26v18m9-23h5m-5 8h5m-5 8h5"/>',
  menu:'<path d="M16 16h16q5 0 5 5v29H21q-5 0-5-5zM37 21q0-5 5-5h6v29q0 5-5 5h-6M21 28h11m-11 8h11"/>',
  soup:'<path d="M15 32h34q0 16-17 16T15 32zm2-4h30m-24-12q-5 5 0 9m9-10q-5 5 0 10m9-9q-5 5 0 9"/>',
  salad:'<path d="M15 36h34q-2 15-17 15T15 36zM20 34q-5-12 5-15q6 2 7 12m2 1q2-14 12-14q5 9-3 16M31 36l-4-15"/>',
  order:'<path d="M19 13h26v38H19zM25 23h14m-14 7h14m-14 7h9m10-4 7 7-8 7-4-4z"/>',
  waiter:'<circle cx="27" cy="19" r="6"/><path d="M18 49V31q0-7 9-7t9 7v18M37 34h15m-15 0q3-11 14-8m-13 8h13"/>',
  fork:'<path d="M22 13v16q0 7 7 7m7-23v16q0 7-7 7m-7-16h14m-7-7v38"/>',
  bill:'<path d="M19 12h26v41l-5-4-5 4-5-4-5 4-6-4zM25 23h14m-14 8h14m-14 9h7"/>',
  picnic:'<path d="M17 32h30l-4 18H21zM23 32q0-13 9-13t9 13M17 39h30m-15 0v11"/>',
  museum:'<path d="M12 25l20-12 20 12zM17 29h30M20 29v17m8-17v17m8-17v17m8-17v17M14 49h36"/>',
  ticket:'<path d="M14 21h36v9q-6 0-6 5t6 5v7H14v-7q6 0 6-5t-6-5zM33 22v24" stroke-dasharray="2 3"/>',
  bicycle:'<circle cx="18" cy="43" r="9"/><circle cx="47" cy="43" r="9"/><path d="M18 43l10-20 9 20H18m10-20h10m-5-5h8m6 25-9-20"/>',
  camera:'<rect x="13" y="23" width="38" height="27" rx="3"/><circle cx="32" cy="36" r="8"/><path d="M21 23l4-7h14l4 7M47 29h1"/>',
  weather:'<circle cx="32" cy="32" r="10"/><path d="M32 12v7m0 26v7M12 32h7m26 0h7M18 18l5 5m18 18 5 5m0-28-5 5M23 41l-5 5"/>',
  backpack:'<rect x="19" y="22" width="26" height="29" rx="6"/><path d="M25 22v-5q7-8 14 0v5M19 30h-5v13h5m26-13h5v13h-5M25 37h14v14H25z"/>',
  map:'<path d="M13 20l12-5 12 5 12-5v30l-12 5-12-5-12 5zM25 15v30m12-25v30"/><circle cx="38" cy="22" r="4"/>',
  corner:'<path d="M14 18v26a6 6 0 0 0 6 6h22M30 50l6-6-6-6"/>',
  street:'<path d="M12 20h40M12 44h40M32 18v28" stroke-dasharray="5 4"/>',
  traffic:'<rect x="24" y="12" width="16" height="36" rx="4"/><circle cx="32" cy="21" r="3"/><circle cx="32" cy="30" r="3"/><circle cx="32" cy="39" r="3"/><path d="M32 48v4"/>',
  bus:'<rect x="13" y="19" width="38" height="27" rx="4"/><path d="M13 32h38M21 46v4m22-4v4"/><circle cx="22" cy="39" r="2"/><circle cx="42" cy="39" r="2"/>',
  hospital:'<rect x="14" y="19" width="36" height="30" rx="2"/><path d="M32 26v16M24 34h16"/><path d="M14 24h36"/>',
  supermarket:'<path d="M14 25V17h36v8M14 25l4 23h28l4-23M26 48V33h12v15"/>'
};
export const wordIcon = word => `<svg viewBox="0 0 64 64" role="img" aria-label="${word} 图示" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="54" height="54" rx="8" fill="var(--sunk)"/><g fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconArt[word]}</g></svg>`;

