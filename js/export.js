const ExportTools = (() => {
  const COMPANY = 'PT. LEUWITEX';

  /* ------------------------------------------------------------
     [1] KONFIGURASI PER MENU
     ------------------------------------------------------------ */
  const CONFIGS = [
    {
      panel: 'panel-karyawan',
      table: 'tabelKaryawan',
      title: 'Daftar Karyawan',
      file: 'daftar-karyawan',
      filters: [['searchKaryawan', 'Pencarian']],
    },
    {
      panel: 'panel-reservasi',
      table: 'tabelReservasi',
      title: 'Daftar Reservasi',
      file: 'daftar-reservasi',
      filters: [
        ['filterReservasiTanggal', 'Tanggal'],
        ['searchReservasi', 'Pencarian'],
      ],
    },
    {
      panel: 'panel-reservasi-overtime',
      table: 'tabelOvertime',
      title: 'Daftar Reservasi Overtime',
      file: 'daftar-overtime',
      filters: [
        ['filterOvertimeTanggal', 'Tanggal'],
        ['searchOvertime', 'Pencarian'],
      ],
    },
    {
      panel: 'panel-release-reservasi',
      table: 'tabelReleaseReservasi',
      title: 'Daftar Release Reservasi',
      file: 'daftar-release-reservasi',
      filters: [['filterReleaseTanggal', 'Tanggal']],
    },
    {
      panel: 'panel-presensi',
      table: 'tabelPresensi',
      title: 'Daftar Presensi',
      file: 'daftar-presensi',
      filters: [
        ['filterPresensiTanggal', 'Tanggal'],
        ['searchPresensi', 'Pencarian'],
      ],
    },
  ];

  /* ------------------------------------------------------------
     [2] HELPER UMUM
     ------------------------------------------------------------ */
  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cleanText(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function todayStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function nowLabel() {
    return new Date().toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatFilterValue(id, raw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }
    return raw;
  }

  /* ------------------------------------------------------------
     [3] BACA DATA DARI TABEL
     ------------------------------------------------------------ */
  function readTable(cfg) {
    const table = document.getElementById(cfg.table);
    if (!table) return null;

    const ths = Array.from(table.querySelectorAll('thead th'));
    const keep = [];
    const headers = [];
    ths.forEach((th, i) => {
      const t = cleanText(th.textContent);
      if (t.toLowerCase() === 'aksi') return;
      keep.push(i);
      headers.push(t);
    });

    const rows = [];
    table.querySelectorAll('tbody tr').forEach((tr) => {
      if (tr.querySelector('td.empty-row')) return;
      const tds = Array.from(tr.children);
      rows.push(keep.map((i) => cleanText(tds[i] ? tds[i].textContent : '')));
    });

    const parts = [];
    cfg.filters.forEach(([id, label]) => {
      const val = (document.getElementById(id)?.value || '').trim();
      if (val) parts.push(`${label}: ${formatFilterValue(id, val)}`);
    });

    return {
      headers,
      rows,
      filterText: parts.length ? parts.join(' | ') : 'Semua data',
    };
  }

  /* ------------------------------------------------------------
     [4] PRINT — lewat iframe tersembunyi
     ------------------------------------------------------------ */
  function buildPrintHtml(cfg, data) {
    const head = data.headers.map((h) => `<th>${esc(h)}</th>`).join('');
    const body = data.rows
      .map(
        (r) =>
          `<tr>${r
            .map((c, i) => {
              const center = data.headers[i] === 'No' ? ' class="c"' : '';
              return `<td${center}>${esc(c)}</td>`;
            })
            .join('')}</tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<title>${esc(cfg.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
  .company { font-size: 12px; font-weight: 700; color: #475569; letter-spacing: .5px; }
  h1 { font-size: 18px; margin: 2px 0 6px; }
  .meta { color: #475569; margin-bottom: 10px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #94a3b8; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #e2e8f0; font-weight: 700; }
  td.c { text-align: center; width: 36px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head><body>
  <div class="company">${esc(COMPANY)}</div>
  <h1>${esc(cfg.title)}</h1>
  <div class="meta">
    Dicetak: ${esc(nowLabel())}<br>
    Filter: ${esc(data.filterText)}<br>
    Total data: ${data.rows.length}
  </div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
  }

  function printList(cfg) {
    const data = readTable(cfg);
    if (!data) return;
    if (data.rows.length === 0) {
      alert('Tidak ada data untuk dicetak.');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win.document;
    doc.open();
    doc.write(buildPrintHtml(cfg, data));
    doc.close();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      iframe.remove();
    };

    win.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error('ExportTools: gagal print', err);
        alert('Gagal membuka dialog cetak.');
        cleanup();
      }
      setTimeout(cleanup, 60000);
    }, 250);
  }

  /* ------------------------------------------------------------
     [5] XLSX — penulis file .xlsx
     ------------------------------------------------------------ */
  const enc = new TextEncoder();

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    const now = new Date();
    const dosTime =
      (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate =
      ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach(({ name, data }) => {
      const nameBytes = enc.encode(name);
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);

      chunks.push(new Uint8Array(local.buffer), nameBytes, data);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, nameBytes.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nameBytes);

      offset += 30 + nameBytes.length + data.length;
    });

    const centralSize = central.reduce((s, b) => s + b.length, 0);

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    const all = [...chunks, ...central, new Uint8Array(end.buffer)];
    const total = all.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    all.forEach((b) => {
      out.set(b, pos);
      pos += b.length;
    });
    return out;
  }

  function xmlEsc(v) {
    return String(v ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colName(i) {
    let s = '';
    let n = i + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF475569"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FF94A3B8"/></left><right style="thin"><color rgb="FF94A3B8"/></right><top style="thin"><color rgb="FF94A3B8"/></top><bottom style="thin"><color rgb="FF94A3B8"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function cellXml(ref, value, style, asNumber) {
    if (asNumber) {
      return `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`;
    }
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(
      value
    )}</t></is></c>`;
  }

  function buildSheetXml({ title, infoLines, headers, rows }) {
    const colCount = headers.length;
    const lastCol = colName(colCount - 1);

    const widths = headers.map((h, ci) => {
      let max = String(h).length;
      rows.forEach((r) => {
        const len = String(r[ci] ?? '').length;
        if (len > max) max = len;
      });
      return Math.min(Math.max(max + 3, 6), 50);
    });
    const colsXml = widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join('');

    const sheetRows = [];
    let r = 1;
    const merges = [];

    sheetRows.push(`<row r="${r}">${cellXml(`A${r}`, title, 1)}</row>`);
    merges.push(`A${r}:${lastCol}${r}`);
    r++;

    infoLines.forEach((line) => {
      sheetRows.push(`<row r="${r}">${cellXml(`A${r}`, line, 2)}</row>`);
      merges.push(`A${r}:${lastCol}${r}`);
      r++;
    });

    r++;

    const headerRow = r;
    sheetRows.push(
      `<row r="${r}" ht="22" customHeight="1">${headers
        .map((h, ci) => cellXml(`${colName(ci)}${r}`, h, 3))
        .join('')}</row>`
    );
    r++;

    rows.forEach((row) => {
      const cells = headers
        .map((h, ci) => {
          const ref = `${colName(ci)}${r}`;
          const v = row[ci] ?? '';
          if (h === 'No' && /^\d+$/.test(v)) return cellXml(ref, v, 5, true);
          return cellXml(ref, v, 4);
        })
        .join('');
      sheetRows.push(`<row r="${r}">${cells}</row>`);
      r++;
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${
      headerRow + 1
    }" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${colsXml}</cols>
<sheetData>${sheetRows.join('')}</sheetData>
<mergeCells count="${merges.length}">${merges
      .map((m) => `<mergeCell ref="${m}"/>`)
      .join('')}</mergeCells>
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>
</worksheet>`;
  }

  function buildXlsx({ title, infoLines, headers, rows, sheetName }) {
    const safeSheet =
      String(sheetName || 'Data')
        .replace(/[\\/?*[\]:]/g, ' ')
        .slice(0, 31) || 'Data';

    const files = [
      {
        name: '[Content_Types].xml',
        data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
      },
      {
        name: '_rels/.rels',
        data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
      },
      {
        name: 'xl/workbook.xml',
        data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEsc(safeSheet)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
      },
      { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
      {
        name: 'xl/worksheets/sheet1.xml',
        data: enc.encode(buildSheetXml({ title, infoLines, headers, rows })),
      },
    ];

    return zipStore(files);
  }

  function download(bytes, filename) {
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportExcel(cfg) {
    const data = readTable(cfg);
    if (!data) return;
    if (data.rows.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    try {
      const bytes = buildXlsx({
        title: `${COMPANY} — ${cfg.title}`,
        infoLines: [
          `Diekspor: ${nowLabel()}`,
          `Filter: ${data.filterText}`,
          `Total data: ${data.rows.length}`,
        ],
        headers: data.headers,
        rows: data.rows,
        sheetName: cfg.title,
      });
      download(bytes, `${cfg.file}-${todayStamp()}.xlsx`);
    } catch (err) {
      console.error('ExportTools: gagal export', err);
      alert('Gagal membuat file Excel.');
    }
  }

  /* ------------------------------------------------------------
     [6] SISIPKAN TOMBOL KE SETIAP MENU
     ------------------------------------------------------------ */
  function injectButtons() {
    CONFIGS.forEach((cfg) => {
      const panel = document.getElementById(cfg.panel);
      const header = panel?.querySelector('.info-header');
      if (!header || header.querySelector('.export-actions')) return;

      const wrap = document.createElement('span');
      wrap.className = 'export-actions';
      wrap.style.cssText = 'display:inline-flex;gap:8px;margin-left:auto;flex-wrap:wrap;';

      const btnPrint = document.createElement('button');
      btnPrint.type = 'button';
      btnPrint.className = 'btn btn-secondary btn-sm';
      btnPrint.textContent = 'Print';
      btnPrint.addEventListener('click', () => printList(cfg));

      const btnExcel = document.createElement('button');
      btnExcel.type = 'button';
      btnExcel.className = 'btn btn-success btn-sm';
      btnExcel.textContent = 'Export Excel';
      btnExcel.addEventListener('click', () => exportExcel(cfg));

      wrap.append(btnPrint, btnExcel);
      header.appendChild(wrap);
    });
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectButtons);
    } else {
      injectButtons();
    }
  }

  return { printList, exportExcel, buildXlsx, CONFIGS };
})();
