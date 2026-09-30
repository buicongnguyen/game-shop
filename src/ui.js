export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function portrait(index=0) {
  const colors=['#413047','#674337','#272d40','#aa6346','#745454'];
  const shirts=['#e88785','#86b9ab','#eda656','#8b91bf','#e49abb'];
  const skin=['#f9ccaf','#ecc2a0','#f5d2b6','#eac2aa','#f7d1af'];
  const i=Math.abs(index)%5;
  return `<svg viewBox="0 0 80 80" aria-hidden="true"><defs><clipPath id="avatar-${index}"><circle cx="40" cy="40" r="39"/></clipPath></defs><g clip-path="url(#avatar-${index})"><path fill="#fff0d9" d="M0 0h80v80H0z"/><path fill="${colors[i]}" d="M17 63V33C14 1 66 1 64 36v30z"/><path fill="${shirts[i]}" d="M6 87q0-29 34-29t34 29"/><path stroke="${skin[i]}" stroke-width="12" d="M40 48v17"/><ellipse cx="40" cy="36" rx="22" ry="25" fill="${skin[i]}"/><path fill="${colors[i]}" d="M17 33q-1-32 27-25 23 4 20 28-17-3-23-17-8 13-24 14"/><g fill="#4a2a2a"><circle cx="32" cy="37" r="2.3"/><circle cx="49" cy="37" r="2.3"/></g><path d="M35 48q6 5 11-1" fill="none" stroke="#9c574e" stroke-width="2" stroke-linecap="round"/><g fill="#f09986" opacity=".6"><ellipse cx="25" cy="44" rx="4" ry="2.5"/><ellipse cx="55" cy="44" rx="4" ry="2.5"/></g>${i===2?'<path d="M24 36h13m7 0h13m-20 2h7" stroke="#594951" fill="none" stroke-width="2"/><rect x="25" y="32" width="12" height="11" rx="4" fill="none" stroke="#594951" stroke-width="2"/><rect x="44" y="32" width="12" height="11" rx="4" fill="none" stroke="#594951" stroke-width="2"/>':''}</g></svg>`;
}
