export function today() {
  return new Date().toISOString().slice(0, 10);
}

// yyyy-mm-dd of the Monday of the given date's week, in local time
// (matches Postgres date_trunc('week', ...) which starts weeks on Monday).
export function weekOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setDate(d.getDate() - day);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Date-only strings (yyyy-mm-dd) are parsed as LOCAL dates so they don't shift a day.
function parseDate(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
}

export function formatDate(d) {
  if (!d) return '—';
  return parseDate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function daysInProgram(start) {
  if (!start) return 0;
  const d = Math.floor((Date.now() - parseDate(start).getTime()) / 86400000);
  return Math.max(0, d);
}

export const PRIOR_COMMITMENT_LABELS = { yes: 'Fully completed', partial: 'Partially completed', not: 'Not completed' };

// Throw if a Supabase response carries an error.
export function throwIfError(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// Show an error to the user. Always logs to the console as well.
export function reportError(err) {
  console.error(err);
  const message = (err && err.message) ? err.message : String(err);
  alert(message);
}

// Run a form submission: disables the submit button while working and reports
// any error without navigating away.
export async function runSubmit(form, fn) {
  // The submit button may sit outside the form (<button form="…">).
  const btn = form.querySelector('[type="submit"]')
    || (form.id ? document.querySelector(`[type="submit"][form="${form.id}"]`) : null);
  if (btn) btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    reportError(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
