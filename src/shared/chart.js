// Small inline SVG trend chart for the three 1-5 scores. `rows` are oldest first
// and expose leadGenerationActivity / lightSpeedVtProgress / loftyCrmUsage.
export function buildTrendChart(rows) {
  if (!rows.length) return `<div class="text-sm text-navy-700/50">No check-ins yet to chart.</div>`;
  const series = [
    { key: 'leadGenerationActivity', label: 'Lead Gen', color: '#1e2a4a' },
    { key: 'lightSpeedVtProgress', label: 'VT', color: '#c9a227' },
    { key: 'loftyCrmUsage', label: 'CRM', color: '#059669' },
  ];
  const w = 480, h = 120, pad = 20;
  const points = rows.map((_, i) => pad + (i / Math.max(1, rows.length - 1)) * (w - pad * 2));
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="w-full h-32" aria-label="Score trends">`;
  [1, 2, 3, 4, 5].forEach(s => {
    const y = h - pad - ((s - 1) / 4) * (h - pad * 2);
    svg += `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
  });
  series.forEach(s => {
    const pts = rows.map((c, i) => {
      const val = Number(c[s.key]);
      if (c[s.key] == null || Number.isNaN(val)) return null;
      const y = h - pad - ((val - 1) / 4) * (h - pad * 2);
      return `${points[i]},${y}`;
    }).filter(Boolean);
    if (pts.length > 1) {
      svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    rows.forEach((c, i) => {
      const val = Number(c[s.key]);
      if (c[s.key] == null || Number.isNaN(val)) return;
      const y = h - pad - ((val - 1) / 4) * (h - pad * 2);
      svg += `<circle cx="${points[i]}" cy="${y}" r="3" fill="${s.color}"/>`;
    });
  });
  svg += `</svg>`;
  const legend = series.map(s => `<span class="inline-flex items-center gap-1 mr-4 text-xs"><span class="w-2 h-2 rounded-full" style="background:${s.color}"></span>${s.label}</span>`).join('');
  return svg + `<div class="mt-2">${legend}</div>`;
}
