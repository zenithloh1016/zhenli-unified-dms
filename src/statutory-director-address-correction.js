/**
 * Apply owner-authored residential-address corrections to the actual privately
 * stored Register of Directors, not just the Annual Return projection.
 * Corrections are held in the user's RLS-protected cloud draft; this module
 * contains no names, identity numbers, or residential addresses.
 */
const tidy = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const key = value => tidy(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const addressKey = value => tidy(value).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+MALAYSIA$/, '').trim();
const labelKey = value => tidy(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nameLabels = new Set(['name', 'full name', 'director name']);
const idLabels = new Set(['identification no', 'identification number', 'nric no', 'nric number', 'ic no', 'ic no passport no', 'nric passport no']);
const addressLabels = new Set(['residential address', 'residential address of director']);
const isDirectors = name => /^register (?:of|or) directors?(?:\b|\s*\()/i.test(tidy(name));

function correctionFor(fields, corrections) {
  const name = fields.find(f => nameLabels.has(labelKey(f.label)));
  const identification = fields.find(f => idLabels.has(labelKey(f.label)));
  const address = fields.find(f => addressLabels.has(labelKey(f.label)));
  if (!name || !address) return null;
  for (const item of corrections || []) {
    if (!item?.fullName || !item?.newAddress || !item?.previousAddress) continue;
    if (key(name.value) !== key(item.fullName)) continue;
    if (item.identificationNo && identification?.value && key(item.identificationNo) !== key(identification.value)) continue;
    if (addressKey(address.value) !== addressKey(item.previousAddress)) continue;
    const oldNo = /^(\s*NO\.?\s*)(\d+)\b/i.exec(String(item.previousAddress));
    const nextNo = /^(\s*NO\.?\s*)(\d+)\b/i.exec(String(item.newAddress));
    const existingNo = /^(\s*NO\.?\s*)(\d+)\b/i.exec(String(address.value));
    if (!oldNo || !nextNo || !existingNo || existingNo[2] !== oldNo[2]) continue;
    return {address, value: String(address.value).replace(/^(\s*NO\.?\s*)(\d+)\b/i, (_whole,prefix) => prefix + nextNo[2])};
  }
  return null;
}

export function applyDirectorAddressCorrections(book, corrections) {
  const updated = structuredClone(book);
  let changed = 0;
  for (const sheet of updated?.sheets || []) {
    if (!isDirectors(sheet.name)) continue;
    const rows = sheet.rows || [];
    // Common imported Excel/table layout: column headings followed by one row per director.
    for (let headerRow = 0; headerRow < Math.min(rows.length, 40); headerRow++) {
      const headings = (rows[headerRow] || []).map(labelKey);
      if (!headings.some(label => nameLabels.has(label)) || !headings.some(label => addressLabels.has(label))) continue;
      const firstNameCol = headings.findIndex(label => nameLabels.has(label));
      if (firstNameCol > 2) continue;
      for (let ri = headerRow + 1; ri < rows.length; ri++) {
        const row = rows[ri] || [];
        if (!row[firstNameCol] || nameLabels.has(labelKey(row[firstNameCol]))) continue;
        const fields = headings.map((label,col) => ({label, value:row[col], row:ri, col}));
        const result = correctionFor(fields, corrections);
        if (result && rows[result.address.row]?.[result.address.col] !== result.value) {
          rows[result.address.row][result.address.col] = result.value;
          changed++;
        }
      }
      break;
    }
    // Historical register variants store one labelled field/value pair per row.
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri] || [];
      if (!nameLabels.has(labelKey(row[0])) || !row[1]) continue;
      const fields=[];
      for (let j=ri; j<Math.min(ri+18,rows.length);j++) {
        const r=rows[j]||[];
        if (j>ri && nameLabels.has(labelKey(r[0]))) break;
        if (r.length>=2) fields.push({label:r[0], value:r[1], row:j, col:1});
      }
      const result=correctionFor(fields,corrections);
      if (result && rows[result.address.row]?.[result.address.col] !== result.value) {
        rows[result.address.row][result.address.col]=result.value;
        changed++;
      }
    }
  }
  return {book: changed ? updated : book, changed};
}
