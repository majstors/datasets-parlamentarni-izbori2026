#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Transliteracija ───────────────────────────────────────────────────────────

const CYR_TO_LAT = {
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z',
  'И':'I','Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O',
  'П':'P','Р':'R','С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C',
  'Ч':'Č','Џ':'Dž','Ш':'Š',
  'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž','з':'z',
  'и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o',
  'п':'p','р':'r','с':'s','т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c',
  'ч':'č','џ':'dž','ш':'š',
};

const DIGRAPHS = [
  ['LJ','Љ'],['Lj','Љ'],['lj','љ'],
  ['NJ','Њ'],['Nj','Њ'],['nj','њ'],
  ['DŽ','Џ'],['Dž','Џ'],['dž','џ'],
];

const LAT_SINGLES = {
  'A':'А','B':'Б','V':'В','G':'Г','D':'Д','Đ':'Ђ','E':'Е','Ž':'Ж','Z':'З',
  'I':'И','J':'Ј','K':'К','L':'Л','M':'М','N':'Н','O':'О','P':'П','R':'Р',
  'S':'С','T':'Т','Ć':'Ћ','U':'У','F':'Ф','H':'Х','C':'Ц','Č':'Ч','Š':'Ш',
  'a':'а','b':'б','v':'в','g':'г','d':'д','đ':'ђ','e':'е','ž':'ж','z':'з',
  'i':'и','j':'ј','k':'к','l':'л','m':'м','n':'н','o':'о','p':'п','r':'р',
  's':'с','t':'т','ć':'ћ','u':'у','f':'ф','h':'х','c':'ц','č':'ч','š':'ш',
};

function cyrToLat(text) {
  return text.split('').map(ch => CYR_TO_LAT[ch] || ch).join('');
}

function latToCyr(text) {
  let result = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const [from, to] of DIGRAPHS) {
      if (text.startsWith(from, i)) {
        result += to;
        i += from.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result += LAT_SINGLES[text[i]] || text[i];
      i++;
    }
  }
  return result;
}

function isEmailOrUrl(text) {
  return /@/.test(text) || /^https?:\/\//i.test(text) || /^www\./i.test(text);
}

function transliterate(text, mode) {
  if (mode === 'cyr' && isEmailOrUrl(text)) return text;
  if (mode === 'lat') return cyrToLat(text);
  if (mode === 'cyr') return latToCyr(text);
  return text;
}

// ── TSV parser ─────────────────────────────────────────────────────────────────

function parseTSV(filePath) {
  let raw = fs.readFileSync(filePath);
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) raw = raw.slice(3);
  const lines = raw.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line) continue;
    const fields = [];
    let field = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { field += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === '\t' && !inQuote) {
        fields.push(field); field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    rows.push(fields);
  }
  return rows;
}

// ── MySQL tip kolone ──────────────────────────────────────────────────────────

function detectMySQLType(values) {
  const nonEmpty = values.filter(v => v !== '');
  const nullable = nonEmpty.length < values.length ? ' NULL' : ' NOT NULL';
  if (nonEmpty.length === 0) return 'TEXT NULL';

  const maxLen = Math.max(...values.map(v => v.length));

  // Celi brojevi — ali ne stringovi sa vodećom nulom (telefoni, šifre)
  const allDigits = nonEmpty.every(v => /^-?\d+$/.test(v));
  const hasLeadingZero = nonEmpty.some(v => v.length > 1 && v[0] === '0');
  if (allDigits && !hasLeadingZero) {
    const maxAbs = nonEmpty.reduce((max, v) => {
      const n = BigInt(v);
      const abs = n < 0n ? -n : n;
      return abs > max ? abs : max;
    }, 0n);
    if (maxAbs <= 127n)        return `TINYINT${nullable}`;
    if (maxAbs <= 32767n)      return `SMALLINT${nullable}`;
    if (maxAbs <= 8388607n)    return `MEDIUMINT${nullable}`;
    if (maxAbs <= 2147483647n) return `INT${nullable}`;
    return                            `BIGINT${nullable}`;
  }

  // Decimalni brojevi
  const allNumeric = nonEmpty.every(v => /^-?\d+(\.\d+)?$/.test(v));
  const hasLeadingZeroNum = nonEmpty.some(v => v.length > 1 && v[0] === '0' && v[1] !== '.');
  if (allNumeric && !hasLeadingZeroNum) {
    const maxD = Math.max(...nonEmpty.map(v => { const p = v.split('.'); return p[1] ? p[1].length : 0; }));
    const maxI = Math.max(...nonEmpty.map(v => String(Math.floor(Math.abs(parseFloat(v)))).length));
    return `DECIMAL(${maxI + maxD},${maxD})${nullable}`;
  }

  if (maxLen <= 255) return `VARCHAR(${maxLen})${nullable}`;
  return `TEXT${nullable}`;
}

// ── MySQL izlaz ───────────────────────────────────────────────────────────────

function toMySQL(headers, rows, tableName) {
  const colTypes = headers.map((h, i) => detectMySQLType(rows.map(r => r[i] ?? '')));
  const isNumeric = colTypes.map(t => /^(TINYINT|SMALLINT|MEDIUMINT|INT|BIGINT|DECIMAL)/.test(t));
  const colNames = headers.map(h => '`' + h.replace(/`/g, '``') + '`');

  let sql = `-- Generisano: ${new Date().toISOString()}\n\n`;
  sql += `CREATE TABLE \`${tableName}\` (\n`;
  sql += colNames.map((n, i) => `  ${n} ${colTypes[i]}`).join(',\n');
  sql += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n';

  for (const row of rows) {
    const vals = row.map((v, i) => {
      if (v === '') return 'NULL';
      if (isNumeric[i]) return v;
      return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    });
    sql += `INSERT INTO \`${tableName}\` (${colNames.join(', ')}) VALUES (${vals.join(', ')});\n`;
  }
  return sql;
}

// ── JSON izlaz ────────────────────────────────────────────────────────────────

function toJSON(headers, rows) {
  const isNumeric = headers.map((h, i) => {
    const vals = rows.map(r => r[i] ?? '').filter(v => v !== '');
    return vals.length > 0
      && vals.every(v => /^-?\d+(\.\d+)?$/.test(v))
      && !vals.some(v => v.length > 1 && v[0] === '0' && v[1] !== '.');
  });
  const records = rows.map(row =>
    Object.fromEntries(headers.map((h, i) => {
      const v = row[i] ?? '';
      if (v === '') return [h, null];
      if (isNumeric[i]) return [h, Number(v)];
      return [h, v];
    }))
  );
  return JSON.stringify(records, null, 2) + '\n';
}

// ── CSV izlaz ─────────────────────────────────────────────────────────────────

function toCSV(headers, rows) {
  const esc = v => (v.includes(',') || v.includes('"') || v.includes('\n'))
    ? '"' + v.replace(/"/g, '""') + '"' : v;
  return '﻿' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\n') + '\n';
}

// ── TSV izlaz ─────────────────────────────────────────────────────────────────

function toTSV(headers, rows) {
  return '﻿' + [headers, ...rows]
    .map(r => r.map(v => v.replace(/[\t\n\r]/g, ' ')).join('\t'))
    .join('\n') + '\n';
}

// ── HTML izlaz ────────────────────────────────────────────────────────────────

function toHTML(headers, rows, title) {
  const e = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<title>${e(title)}</title>
<style>
body{font-family:Arial,sans-serif;font-size:13px;padding:16px}
h2{margin-bottom:10px}
table{border-collapse:collapse}
th,td{border:1px solid #ccc;padding:4px 10px;white-space:nowrap}
th{background:#e8eaf0;font-weight:bold}
tr:nth-child(even){background:#f7f7f7}
tr:hover{background:#eef}
</style>
</head>
<body>
<h2>${e(title)}</h2>
<table>
<thead><tr>${headers.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead>
<tbody>
${rows.map(r => `<tr>${r.map(v => `<td>${e(v)}</td>`).join('')}</tr>`).join('\n')}
</tbody>
</table>
</body>
</html>`;
}

// ── XLSX izlaz ────────────────────────────────────────────────────────────────
// Ručna implementacija: ZIP (store, bez kompresije) + minimalni OOXML

function makeCRC32Table() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
}
const CRC_TABLE = makeCRC32Table();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZIP(files) {
  const parts = [];
  const cdEntries = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nb = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const lh = Buffer.alloc(30 + nb.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);   // stored
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nb.length, 26);
    lh.writeUInt16LE(0, 28);
    nb.copy(lh, 30);

    const cd = Buffer.alloc(46 + nb.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nb.length, 28);
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    nb.copy(cd, 46);

    parts.push(lh, data);
    cdEntries.push(cd);
    offset += lh.length + data.length;
  }

  const cdBuf = Buffer.concat(cdEntries);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(cdEntries.length, 8);
  eocd.writeUInt16LE(cdEntries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, cdBuf, eocd]);
}

function colLetter(n) {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

function xmlEsc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
           .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function colWidth(colValues, header) {
  const max = Math.max(header.length, ...colValues.map(v => v.length));
  // +2 za padding, min 8, max 60
  return Math.min(Math.max(max + 2, 8), 60);
}

function toXLSX(headers, rows, sheetName) {
  const safeName = sheetName.replace(/[\\/?*[\]]/g, '_').substring(0, 31);

  // Kolone koje su numeričke (za tip ćelije)
  const numCols = headers.map((h, i) => {
    const vals = rows.map(r => r[i] ?? '').filter(v => v !== '');
    if (vals.length === 0) return false;
    const allNum = vals.every(v => /^-?\d+(\.\d+)?$/.test(v));
    const noLeadZero = !vals.some(v => v.length > 1 && v[0] === '0' && v[1] !== '.');
    return allNum && noLeadZero;
  });

  const widths = headers.map((h, i) => colWidth(rows.map(r => r[i] ?? ''), h));

  const ct = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEsc(safeName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Dva stila: 0 = normalno, 1 = bold (zaglavlje)
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><sz val="11"/><b/><name val="Calibri"/></font>
</fonts>
<fills count="2">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
</cellXfs>
</styleSheet>`;

  let sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>
${widths.map((w, i) => `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('\n')}
</cols>
<sheetData>
`;

  const allRows = [headers, ...rows];
  for (let ri = 0; ri < allRows.length; ri++) {
    const row = allRows[ri];
    const isHeader = ri === 0;
    sheet += `<row r="${ri + 1}">`;
    for (let ci = 0; ci < row.length; ci++) {
      const ref = colLetter(ci + 1) + (ri + 1);
      const v = row[ci] ?? '';
      if (isHeader) {
        sheet += `<c r="${ref}" t="inlineStr" s="1"><is><t>${xmlEsc(v)}</t></is></c>`;
      } else if (numCols[ci] && v !== '') {
        sheet += `<c r="${ref}"><v>${xmlEsc(v)}</v></c>`;
      } else {
        sheet += `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
      }
    }
    sheet += `</row>\n`;
  }
  sheet += `</sheetData>\n</worksheet>`;

  return buildZIP([
    { name: '[Content_Types].xml',          data: Buffer.from(ct,       'utf8') },
    { name: '_rels/.rels',                  data: Buffer.from(rels,     'utf8') },
    { name: 'xl/workbook.xml',              data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels',   data: Buffer.from(wbRels,   'utf8') },
    { name: 'xl/styles.xml',               data: Buffer.from(styles,   'utf8') },
    { name: 'xl/worksheets/sheet1.xml',    data: Buffer.from(sheet,    'utf8') },
  ]);
}

// ── Interaktivni meni ─────────────────────────────────────────────────────────

function ask(rl, q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function main() {
  const dir = process.cwd();
  const tsvFiles = fs.readdirSync(dir).filter(f => f.endsWith('.tsv')).sort();

  if (!tsvFiles.length) {
    console.error('Nema .tsv fajlova u trenutnom direktorijumu.');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n── Izbor skupa podataka ──────────────────────────────');
  tsvFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  const fi = parseInt(await ask(rl, '\nFajl (broj): '), 10) - 1;
  if (fi < 0 || fi >= tsvFiles.length) { console.error('Nevažeći izbor.'); rl.close(); return; }

  console.log('\n── Transliteracija ───────────────────────────────────');
  console.log('  1. Bez promene');
  console.log('  2. Ćirilica → Latinica');
  console.log('  3. Latinica → Ćirilica');
  const tm = await ask(rl, '\nIzbor (broj): ');
  const translitMode = { '1': null, '2': 'lat', '3': 'cyr' }[tm.trim()] ?? null;

  console.log('\n── Izlazni format ────────────────────────────────────');
  const formats = ['MySQL (CREATE + INSERT)', 'CSV', 'TSV', 'HTML', 'Excel (.xlsx)', 'JSON'];
  formats.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  const fmtRaw = parseInt(await ask(rl, '\nFormat (broj): '), 10) - 1;
  rl.close();

  if (fmtRaw < 0 || fmtRaw >= formats.length) { console.error('Nevažeći izbor.'); return; }

  // Parsiranje
  const filePath = path.join(dir, tsvFiles[fi]);
  process.stdout.write('\nČitam i obrađujem...');
  const rows = parseTSV(filePath);
  const headers = rows[0];
  const dataRows = rows.slice(1).map(row => {
    const r = row.map(v => translitMode ? transliterate(v, translitMode) : v);
    while (r.length < headers.length) r.push('');
    return r.slice(0, headers.length);
  });
  const tHeaders = headers.map(v => translitMode === 'lat' ? transliterate(v, 'lat') : v);

  const baseName = path.basename(tsvFiles[fi], '.tsv');
  const scriptSuffix = translitMode === 'lat' ? '_lat' : translitMode === 'cyr' ? '_cir' : '';
  const outBase = baseName + scriptSuffix;
  const tableName = outBase.replace(/[^a-z0-9_]/gi, '_');
  const exts = ['.sql', '.csv', '.tsv', '.html', '.xlsx', '.json'];
  const outPath = path.join(dir, outBase + exts[fmtRaw]);

  let output;
  switch (fmtRaw) {
    case 0: output = { text: toMySQL(tHeaders, dataRows, tableName) }; break;
    case 1: output = { text: toCSV(tHeaders, dataRows) }; break;
    case 2: output = { text: toTSV(tHeaders, dataRows) }; break;
    case 3: output = { text: toHTML(tHeaders, dataRows, outBase) }; break;
    case 4: output = { bin: toXLSX(tHeaders, dataRows, outBase) }; break;
    case 5: output = { text: toJSON(tHeaders, dataRows) }; break;
  }

  if (output.bin) {
    fs.writeFileSync(outPath, output.bin);
  } else {
    fs.writeFileSync(outPath, output.text, 'utf8');
  }

  console.log(` gotovo.\n\nSačuvano: ${outPath}`);
  if (fmtRaw === 0) {
    console.log('\nDetektovani tipovi kolona:');
    tHeaders.forEach((h, i) => {
      const type = detectMySQLType(dataRows.map(r => r[i] ?? ''));
      console.log(`  ${h.padEnd(20)} ${type}`);
    });
  }
}

main().catch(err => { console.error('\nGreška:', err.message); process.exit(1); });
