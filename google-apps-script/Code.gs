/**
 * DC-Ops OCR — Google Apps Script Web App
 * Version: 2.1 (6-column param format + CER per parameter)
 *
 * Deploy sebagai:
 *   Extensions → Apps Script → Deploy → New deployment → Web app
 *   Execute as: Me | Who has access: Anyone
 *
 * Setiap POST request dari dashboard akan diproses di sini.
 * Format payload yang diterima:
 * {
 *   id, panelName, panelId, operatorName, shift, hour, timestamp,
 *   location, status, notes,
 *   paramRows: [{ param_ocr, value_ocr, unit_ocr, param_verify, value_verify, unit_verify }],
 *   ocrReadings:      { Vavg: 229.99, ... }  // flat dict (legacy)
 *   verifiedReadings: [{ name, value, unit }] // structured
 * }
 *
 * Data akan ditulis ke sheet dengan nama sesuai panelName.
 * Kolom: Timestamp | Shift | Operator | Lokasi | Notes |
 *         [Per parameter: Param(OCR) | Value(OCR) | Satuan(OCR) | Param(Verify) | Value(Verify) | Satuan(Verify)
 *                         | S | D | I | N | CER]
 *
 * Rumus CER = (S + D + I) / N
 *   S = Substitution  (karakter salah)
 *   D = Deletion      (karakter hilang dari OCR)
 *   I = Insertion     (karakter tambahan di OCR)
 *   N = Total karakter pada Verify Value (ground truth)
 */

// ─────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    writeToSheet(data);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Allow CORS preflight
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'online', version: '2.0' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
// CORE WRITER
// ─────────────────────────────────────────────────────────────

function writeToSheet(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Sheet name = panel name (sanitised)
  var sheetName = sanitize(data.panelName || 'Unknown Panel');
  var sheet = ss.getSheetByName(sheetName);

  // --- Build paramRows ------------------------------------------------
  // Support both new structured format (paramRows) and legacy flat dict
  var paramRows = [];

  if (data.paramRows && data.paramRows.length > 0) {
    // New format: [{param_ocr, value_ocr, unit_ocr, param_verify, value_verify, unit_verify}]
    paramRows = data.paramRows;
  } else if (data.verifiedReadings && data.verifiedReadings.length > 0) {
    // verifiedReadings only — build paramRows from it + ocrReadings
    var ocrMap = data.ocrReadings || {};
    paramRows = data.verifiedReadings.map(function(vr) {
      return {
        param_ocr:    vr.name,
        value_ocr:    ocrMap[vr.name] !== undefined ? ocrMap[vr.name] : '',
        unit_ocr:     vr.unit,
        param_verify: vr.name,
        value_verify: vr.value !== null ? vr.value : '',
        unit_verify:  vr.unit
      };
    });
  } else if (data.ocrReadings) {
    // Legacy flat ocrReadings only
    Object.keys(data.ocrReadings).forEach(function(key) {
      paramRows.push({
        param_ocr:    key,
        value_ocr:    data.ocrReadings[key],
        unit_ocr:     '',
        param_verify: key,
        value_verify: data.ocrReadings[key],
        unit_verify:  ''
      });
    });
  }

  // --- Build header if sheet is new -----------------------------------
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    writeHeader(sheet, paramRows);
  } else if (sheet.getLastRow() === 0) {
    writeHeader(sheet, paramRows);
  } else {
    // Update header if param count changed
    // Each param group = 6 data cols + 5 CER cols (S, D, I, N, CER)
    var existingCols = sheet.getLastColumn();
    var expectedCols = 5 + paramRows.length * 11;
    if (existingCols < expectedCols) {
      updateHeader(sheet, paramRows);
    }
  }

  // --- Compose data row -----------------------------------------------
  var ts = data.timestamp
    ? Utilities.formatDate(new Date(data.timestamp), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  var row = [
    ts,                           // A: Timestamp
    data.shift  || '',            // B: Shift
    data.operatorName || '',      // C: Operator
    data.location || '',          // D: Lokasi
    data.notes  || '',            // E: Notes
  ];

  // Append 6 data cols + 5 CER cols per parameter
  paramRows.forEach(function(pr) {
    var paramOcr  = pr.param_ocr    !== undefined ? String(pr.param_ocr)    : '';
    var valueOcr  = pr.value_ocr    !== undefined ? String(pr.value_ocr)    : '';
    var unitOcr   = pr.unit_ocr     !== undefined ? String(pr.unit_ocr)     : '';
    var paramVer  = pr.param_verify !== undefined ? String(pr.param_verify) : '';
    var valueVer  = pr.value_verify !== undefined ? String(pr.value_verify) : '';
    var unitVer   = pr.unit_verify  !== undefined ? String(pr.unit_verify)  : '';

    // CER dibandingkan dari teks penuh: "NamaParam Nilai Satuan"
    // sehingga kesalahan pada nama parameter, nilai, MAUPUN satuan
    // (misal "Vawg 235,27 V" vs "Vavg 235,27 V") ikut terhitung.
    var ocrFull    = [paramOcr, valueOcr, unitOcr].filter(function(s){ return s !== ''; }).join(' ');
    var verifyFull = [paramVer, valueVer, unitVer].filter(function(s){ return s !== ''; }).join(' ');
    var cer = computeCER(ocrFull, verifyFull);

    row.push(pr.param_ocr    !== undefined ? pr.param_ocr    : '');
    row.push(pr.value_ocr    !== undefined ? pr.value_ocr    : '');
    row.push(pr.unit_ocr     !== undefined ? pr.unit_ocr     : '');
    row.push(pr.param_verify !== undefined ? pr.param_verify : '');
    row.push(pr.value_verify !== undefined ? pr.value_verify : '');
    row.push(pr.unit_verify  !== undefined ? pr.unit_verify  : '');

    // CER columns
    row.push(cer.S);    // Substitution
    row.push(cer.D);    // Deletion
    row.push(cer.I);    // Insertion
    row.push(cer.N);    // Total chars (ground truth)
    row.push(cer.CER);  // CER value
  });

  sheet.appendRow(row);

  // Auto-format last row
  formatLastRow(sheet, paramRows.length);
}

// ─────────────────────────────────────────────────────────────
// HEADER HELPERS
// ─────────────────────────────────────────────────────────────

function writeHeader(sheet, paramRows) {
  var header = ['Timestamp', 'Shift', 'Operator', 'Lokasi', 'Notes'];
  paramRows.forEach(function(pr, i) {
    var label = pr.param_verify || pr.param_ocr || ('Param ' + (i + 1));
    header.push(label + ' (OCR Param)');
    header.push(label + ' (OCR Value)');
    header.push(label + ' (OCR Satuan)');
    header.push(label + ' (Verify Param)');
    header.push(label + ' (Verify Value)');
    header.push(label + ' (Verify Satuan)');
    // CER columns
    header.push(label + ' S');
    header.push(label + ' D');
    header.push(label + ' I');
    header.push(label + ' N');
    header.push(label + ' CER');
  });
  sheet.appendRow(header);

  // Style header row
  var headerRange = sheet.getRange(1, 1, 1, header.length);
  headerRange.setBackground('#1e3a5f');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(10);

  // Color OCR columns vs Verify columns vs CER columns
  paramRows.forEach(function(_, i) {
    var groupStart  = 6 + i * 11;   // 5 fixed + 11 cols per param
    var ocrStart    = groupStart;
    var verifyStart = groupStart + 3;
    var cerStart    = groupStart + 6;
    sheet.getRange(1, ocrStart,    1, 3).setBackground('#2d6a9f');
    sheet.getRange(1, verifyStart, 1, 3).setBackground('#1a6b3c');
    sheet.getRange(1, cerStart,    1, 5).setBackground('#7d3c98'); // CER = ungu
  });

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
}

function updateHeader(sheet, paramRows) {
  // Append missing columns to existing header
  var lastCol      = sheet.getLastColumn();
  var expectedCols = 5 + paramRows.length * 11;
  if (lastCol >= expectedCols) return;

  var existingParams = Math.floor((lastCol - 5) / 11);
  for (var i = existingParams; i < paramRows.length; i++) {
    var label = paramRows[i].param_verify || paramRows[i].param_ocr || ('Param ' + (i + 1));
    var newCols = [
      label + ' (OCR Param)',
      label + ' (OCR Value)',
      label + ' (OCR Satuan)',
      label + ' (Verify Param)',
      label + ' (Verify Value)',
      label + ' (Verify Satuan)',
      label + ' S',
      label + ' D',
      label + ' I',
      label + ' N',
      label + ' CER'
    ];
    var startCol = 6 + i * 11;
    sheet.getRange(1, startCol, 1, newCols.length).setValues([newCols]);
    sheet.getRange(1, startCol,     1, 3).setBackground('#2d6a9f').setFontColor('#ffffff').setFontWeight('bold');
    sheet.getRange(1, startCol + 3, 1, 3).setBackground('#1a6b3c').setFontColor('#ffffff').setFontWeight('bold');
    sheet.getRange(1, startCol + 6, 1, 5).setBackground('#7d3c98').setFontColor('#ffffff').setFontWeight('bold');
  }
}

// ─────────────────────────────────────────────────────────────
// FORMATTING
// ─────────────────────────────────────────────────────────────

function formatLastRow(sheet, paramCount) {
  var lastRow   = sheet.getLastRow();
  var totalCols = 5 + paramCount * 11; // 6 data + 5 CER per param

  // Alternate row zebra striping
  var bg = lastRow % 2 === 0 ? '#f0f4f8' : '#ffffff';
  sheet.getRange(lastRow, 1, 1, totalCols).setBackground(bg);

  for (var i = 0; i < paramCount; i++) {
    var groupStart = 6 + i * 11;
    // OCR value column (2nd in group)
    var ocrValCol  = groupStart + 1;
    // Verify value column (5th in group)
    var verValCol  = groupStart + 4;
    // CER result column (11th in group, 0-indexed = +10)
    var cerCol     = groupStart + 10;

    sheet.getRange(lastRow, ocrValCol, 1, 1).setFontWeight('bold').setFontColor('#1a4a7a');
    sheet.getRange(lastRow, verValCol, 1, 1).setFontWeight('bold').setFontColor('#145a32');

    // Style CER cells
    var cerVal = sheet.getRange(lastRow, cerCol, 1, 1).getValue();
    var cerColor = (cerVal === '' || cerVal === null) ? '#cccccc'
                 : (cerVal === 0)                    ? '#27ae60'  // hijau = sempurna
                 : (cerVal <= 0.1)                   ? '#f39c12'  // oranye = kecil
                 :                                     '#e74c3c'; // merah = besar
    sheet.getRange(lastRow, cerCol, 1, 1)
         .setFontWeight('bold')
         .setFontColor('#ffffff')
         .setBackground(cerColor)
         .setNumberFormat('0.00%');

    // Format S, D, I, N as plain integers
    sheet.getRange(lastRow, groupStart + 6, 1, 4).setNumberFormat('0');
  }
}

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

function sanitize(name) {
  // Remove characters illegal in sheet names
  return name.replace(/[\\\/\?\*\[\]:]/g, '_').substring(0, 100);
}

// ─────────────────────────────────────────────────────────────
// CER CALCULATION
// ─────────────────────────────────────────────────────────────

/**
 * Menghitung Character Error Rate (CER) antara string OCR dan ground truth.
 *
 * CER = (S + D + I) / N
 *   S = Substitution  (karakter salah)
 *   D = Deletion      (karakter yang ada di truth tapi tidak di OCR)
 *   I = Insertion     (karakter di OCR yang tidak ada di truth)
 *   N = panjang string ground truth (Verify Value)
 *
 * Menggunakan Levenshtein edit-distance dengan back-tracking
 * untuk memisahkan S, D, dan I.
 *
 * @param {string} ocr      - String hasil OCR
 * @param {string} truth    - String ground truth (verified)
 * @returns {{ S:number, D:number, I:number, N:number, CER:number }}
 */
function computeCER(ocr, truth) {
  var s = String(ocr   === null || ocr   === undefined ? '' : ocr).trim();
  var t = String(truth === null || truth === undefined ? '' : truth).trim();

  var N = t.length;

  // Jika keduanya kosong — tidak ada data, kembalikan string kosong
  if (N === 0 && s.length === 0) {
    return { S: '', D: '', I: '', N: '', CER: '' };
  }

  // Jika ground truth kosong tapi OCR ada — semua insertion
  if (N === 0) {
    return { S: 0, D: 0, I: s.length, N: 0, CER: '' }; // CER tak terdefinisi
  }

  // Hitung matriks Levenshtein
  var mat = levenshteinMatrix(s, t);

  // Back-track untuk hitung S, D, I
  var i = s.length, j = t.length;
  var S = 0, D = 0, I = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && s[i - 1] === t[j - 1]) {
      // Match — tidak ada operasi
      i--; j--;
    } else if (i > 0 && j > 0 && mat[i][j] === mat[i - 1][j - 1] + 1) {
      // Substitution
      S++; i--; j--;
    } else if (j > 0 && mat[i][j] === mat[i][j - 1] + 1) {
      // Deletion (karakter di truth tidak ada di OCR)
      D++; j--;
    } else {
      // Insertion (karakter di OCR tidak ada di truth)
      I++; i--;
    }
  }

  var cerValue = (S + D + I) / N;
  return { S: S, D: D, I: I, N: N, CER: cerValue };
}

/**
 * Membangun matriks Levenshtein antara dua string.
 * @param {string} s - string sumber (OCR)
 * @param {string} t - string target (truth)
 * @returns {number[][]}
 */
function levenshteinMatrix(s, t) {
  var m = s.length;
  var n = t.length;
  var mat = [];

  for (var i = 0; i <= m; i++) {
    mat[i] = [];
    for (var j = 0; j <= n; j++) {
      if (i === 0) {
        mat[i][j] = j;
      } else if (j === 0) {
        mat[i][j] = i;
      } else if (s[i - 1] === t[j - 1]) {
        mat[i][j] = mat[i - 1][j - 1];
      } else {
        mat[i][j] = 1 + Math.min(
          mat[i - 1][j - 1], // substitution
          mat[i][j - 1],     // deletion
          mat[i - 1][j]      // insertion
        );
      }
    }
  }
  return mat;
}
