/****************************************************************************
 * PakiPoshak — Order Intake Script  (v2)
 * --------------------------------------------------------------------------
 * WHAT THIS DOES
 *   1. New order  → appends a full backup row (name, WhatsApp, ADDRESS, TOTAL,
 *                   items, links) and emails you the order.
 *   2. Payment    → saves the slip to Drive, records amount / method / TrxID,
 *                   checks the amount against the order total, and flags any
 *                   mismatch as "payment_review" with a one-tap WhatsApp link
 *                   to message the customer.
 *   3. Placement  → links one or more PSB order IDs to the order YOU placed at
 *                   the brand (brand order ref + which Gmail you used).
 *
 * ───────────────────────── HOW TO RE-DEPLOY (after editing) ──────────────────
 *  1. Open your tracking Google Sheet (PakStyle_BD_Order_Tracker)
 *  2. Extensions → Apps Script
 *  3. Select ALL, delete, PASTE this whole file, 💾 Save
 *  4. Deploy → Manage deployments → ✏️ (edit) the existing Web app
 *  5. "Version" → New version → Deploy   (keeps the SAME /exec URL — no app change needed)
 *     (First-time setup instead: Deploy → New deployment → Web app →
 *      Execute as: Me · Who has access: Anyone · then copy the /exec URL.)
 *
 * SHEET COLUMNS (auto-created on first run — do not rename A–I):
 *  A order_id | B buyer_name | C whatsapp | D status | E status_date | F notes
 *  G receipt_url | H order_items | I cart_links | J delivery_address | K est_total
 *  L payment_amount | M payment_method | N payment_trxid | O payment_match
 *  P placed_gmail | Q brand_order_ref | R placed_status
 ****************************************************************************/

// ── CONFIG ──────────────────────────────────────────────────────────────
var OWNER_EMAIL = 'collectionmoors@gmail.com';   // where order emails go
var SHEET_TAB   = 'Order Tracker';               // the tab with your columns
var SLIP_FOLDER = 'PakStyle Payment Slips';      // Drive folder for receipts

// Canonical column order. Position in this list = column (1 = A, 2 = B, …).
var COLS = ['order_id','buyer_name','whatsapp','status','status_date','notes',
            'receipt_url','order_items','cart_links','delivery_address','est_total',
            'payment_amount','payment_method','payment_trxid','payment_match',
            'placed_gmail','brand_order_ref','placed_status'];

// ── MAIN HANDLER (do not edit below) ────────────────────────────────────
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_TAB) || ss.getSheets()[0];
    var today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Asia/Dhaka', 'yyyy-MM-dd');
    ensureHeaders(sheet);

    if (data.type === 'payment')   return handlePayment(data, sheet, today);
    if (data.type === 'placement') return handlePlacement(data, sheet, today);
    return handleNewOrder(data, sheet, today);

  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Send owner email but never let a mail hiccup / missing permission abort the
// data write. If this stays silent, run authorizeNow() once (see bottom).
function safeMail(subject, body){
  try { MailApp.sendEmail(OWNER_EMAIL, subject, body); }
  catch (e) { /* mail not authorized yet — order data is still saved */ }
}

// Set the Status cell, but tolerate a data-validation dropdown that rejects the
// value. Richer statuses (payment_review / placed_at_brand) apply only if you
// add them to the dropdown; otherwise the status is left as-is and the dedicated
// columns (payment_match / placed_status) carry the signal.
function safeSetStatus(sheet, rowNum, m, value){
  if (m['status'] === undefined) return;
  try { sheet.getRange(rowNum, m['status'] + 1).setValue(value); }
  catch (e) { /* dropdown rejected this status — leave the existing one */ }
}

// Create any missing column header (never overwrites an existing one).
function ensureHeaders(sheet){
  var width = Math.max(COLS.length, sheet.getLastColumn());
  var hdr   = sheet.getRange(1, 1, 1, width).getValues()[0];
  for (var i = 0; i < COLS.length; i++){
    if (String(hdr[i] || '').trim() === '') sheet.getRange(1, i + 1).setValue(COLS[i]);
  }
}

// header-name (lowercased, spaces→_) → 0-based column index
function headerMap(sheet){
  var hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var m = {};
  for (var i = 0; i < hdr.length; i++) m[String(hdr[i]).trim().toLowerCase().replace(/\s+/g, '_')] = i;
  return m;
}

// Locate an order row by order_id. Returns {rowNum, row, map}; rowNum -1 if absent.
function findRow(sheet, orderId){
  var values = sheet.getDataRange().getValues();
  var m = headerMap(sheet);
  var cId = m['order_id'];
  orderId = String(orderId || '').trim().toUpperCase();
  for (var i = 1; i < values.length; i++){
    if (String(values[i][cId]).trim().toUpperCase() === orderId) return { rowNum: i + 1, row: values[i], map: m };
  }
  return { rowNum: -1, row: null, map: m };
}

// ── NEW ORDER → append full backup row + email owner ────────────────────
function handleNewOrder(data, sheet, today){
  // A..K (later columns filled by the payment / placement steps)
  sheet.appendRow([
    data.order_id        || '',
    data.buyer_name      || '',
    data.whatsapp        || '',
    'order_received',
    today,
    'New order — awaiting payment',
    '',                                  // receipt_url
    data.order_items     || '',
    data.cart_links      || '',
    data.delivery_address|| '',          // J — backup
    data.estimated_total_bdt || ''       // K — backup
  ]);

  var subject = 'New PakiPoshak Order ' + (data.order_id || '') + ' — ' + (data.buyer_name || '');
  var body =
    'NEW ORDER RECEIVED\n==================\n\n' +
    'Order ID:    ' + (data.order_id || '') + '\n' +
    'Name:        ' + (data.buyer_name || '') + '\n' +
    'WhatsApp:    ' + (data.whatsapp || '') + '\n' +
    'Email:       ' + (data.email || '(none — contact via WhatsApp)') + '\n' +
    'Address:     ' + (data.delivery_address || '') + '\n' +
    'Est. Total:  ' + (data.estimated_total_bdt || '') + '\n' +
    'Item count:  ' + (data.item_count || '') + '\n\n' +
    'ITEMS\n-----\n' + (data.order_items || '') + '\n\n' +
    'PRODUCT LINKS\n-------------\n' + (data.cart_links || '') + '\n\n' +
    'Notes: ' + (data.notes || '(none)') + '\n\n' +
    '— Backup row added automatically.';
  safeMail(subject, body);

  return json({ ok: true });
}

// ── PAYMENT → save slip + verify amount + update row + flag mismatches ───
function handlePayment(data, sheet, today){
  var orderId  = String(data.order_id || '').trim().toUpperCase();
  var amount   = (data.payment_amount   !== undefined && data.payment_amount   !== null) ? data.payment_amount   : '';
  var method   = data.payment_method || '';
  var trx      = data.payment_trxid  || '';
  var expected = (data.expected_total_bdt !== undefined && data.expected_total_bdt !== null) ? data.expected_total_bdt : '';
  var mismatch = (data.amount_match === false);   // undefined (old client) → treated as OK
  var msg      = String(data.payment_message || '').trim();

  // 1) Save the receipt image to Drive (if one was sent)
  var receiptUrl = '';
  if (data.receipt_base64){
    var folders = DriveApp.getFoldersByName(SLIP_FOLDER);
    var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(SLIP_FOLDER);
    var bytes   = Utilities.base64Decode(data.receipt_base64);
    var blob    = Utilities.newBlob(bytes, data.receipt_type || 'image/jpeg', (orderId || 'receipt') + '_' + Date.now() + '.jpg');
    var file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    receiptUrl  = file.getUrl();
  }

  var found     = findRow(sheet, orderId);
  var m         = found.map;
  var newStatus = mismatch ? 'payment_review' : 'payment_received';
  var note      = (mismatch ? '⚠️ PAYMENT NEEDS REVIEW ' : '💰 Payment submitted ') + today +
                  ' | ৳' + amount + ' via ' + method + (trx ? ' | TrxID ' + trx : '') +
                  (mismatch ? ' | expected ৳' + expected : '') + (msg ? ' | ' + msg : '');

  function setCol(rowNum, key, val){
    if (m[key] !== undefined && val !== '' && val !== undefined && val !== null)
      sheet.getRange(rowNum, m[key] + 1).setValue(val);
  }

  var custName = '', custWa = '';
  if (found.rowNum > 0){
    var rn = found.rowNum;
    safeSetStatus(sheet, rn, m, newStatus);   // tolerates a status-dropdown rule
    setCol(rn, 'status_date',    today);
    setCol(rn, 'payment_amount', amount);
    setCol(rn, 'payment_method', method);
    setCol(rn, 'payment_trxid',  trx);
    setCol(rn, 'payment_match',  mismatch ? 'NO' : 'YES');
    if (receiptUrl) setCol(rn, 'receipt_url', receiptUrl);
    if (m['notes'] !== undefined){
      var prev = String(sheet.getRange(rn, m['notes'] + 1).getValue() || '');
      sheet.getRange(rn, m['notes'] + 1).setValue(note + (prev ? ' || ' + prev : ''));
    }
    custName = (m['buyer_name'] !== undefined) ? String(found.row[m['buyer_name']] || '') : '';
    custWa   = (m['whatsapp']   !== undefined) ? String(found.row[m['whatsapp']]   || '') : '';
  } else {
    // Order not in sheet yet → append a payment-only row so nothing is lost
    var arr = [];
    arr[m['order_id']]    = data.order_id || '';
    arr[m['status']]      = 'payment_received';   // valid status (append needs one the dropdown allows)
    arr[m['status_date']] = today;
    arr[m['notes']]       = note + ' (order row not found)';
    if (m['receipt_url']    !== undefined) arr[m['receipt_url']]    = receiptUrl;
    if (m['payment_amount'] !== undefined) arr[m['payment_amount']] = amount;
    if (m['payment_method'] !== undefined) arr[m['payment_method']] = method;
    if (m['payment_trxid']  !== undefined) arr[m['payment_trxid']]  = trx;
    if (m['payment_match']  !== undefined) arr[m['payment_match']]  = mismatch ? 'NO' : 'YES';
    var maxc = sheet.getLastColumn();
    for (var j = 0; j < maxc; j++) if (arr[j] === undefined) arr[j] = '';
    sheet.appendRow(arr);
  }

  // 3) Email owner — when flagged, include a ready-to-send WhatsApp link
  var subject = (mismatch ? '⚠️ Payment NEEDS REVIEW — ' : '💰 Payment submitted — ') + orderId;
  var body =
    'Order ID:  ' + orderId + '\n' +
    'Customer:  ' + custName + (custWa ? ' (' + custWa + ')' : '') + '\n' +
    'Amount:    ৳' + amount + ' via ' + method + (trx ? '  (TrxID ' + trx + ')' : '') + '\n' +
    'Expected:  ৳' + expected + '\n' +
    'Match:     ' + (mismatch ? 'NO ⚠️' : 'yes') + '\n' +
    'Receipt:   ' + (receiptUrl || '(no image attached)') + '\n' +
    (msg ? 'Message:   ' + msg + '\n' : '');

  if (mismatch && custWa){
    var waDigits = custWa.replace(/[^\d]/g, '');
    var tmpl = 'Hi ' + (custName || 'there') + ', this is PakiPoshak about your order ' + orderId + '. ' +
               'We received your payment note of ৳' + amount + ', but your order total is ৳' + expected + '. ' +
               'Could you please confirm the correct amount, or share your bKash/Nagad TrxID? Thank you!';
    body += '\n— Looks off? Tap to message the customer on WhatsApp:\n' +
            'https://wa.me/' + waDigits + '?text=' + encodeURIComponent(tmpl) + '\n';
  }
  safeMail(subject, body);

  return json({ ok: true, receiptUrl: receiptUrl, flagged: mismatch });
}

// ── PLACEMENT → link our PSB order(s) to the order placed at the brand ───
function handlePlacement(data, sheet, today){
  var ids   = data.order_ids || (data.order_id ? [data.order_id] : []);
  var gmail = data.placed_gmail    || '';   // e.g. "G1" alias, or full address
  var ref   = data.brand_order_ref || '';   // the brand's own order number
  var brand = data.brand           || '';
  var pstat = data.placed_status   || 'placed';
  var m     = headerMap(sheet);
  var done  = [];

  for (var k = 0; k < ids.length; k++){
    var found = findRow(sheet, ids[k]);
    if (found.rowNum > 0){
      var rn = found.rowNum;
      if (m['placed_gmail']    !== undefined && gmail) sheet.getRange(rn, m['placed_gmail']    + 1).setValue(gmail);
      if (m['brand_order_ref'] !== undefined && ref)   sheet.getRange(rn, m['brand_order_ref'] + 1).setValue((brand ? brand + ' ' : '') + ref);
      if (m['placed_status']   !== undefined)          sheet.getRange(rn, m['placed_status']   + 1).setValue(pstat);
      safeSetStatus(sheet, rn, m, 'placed_at_brand');   // tolerates a status-dropdown rule
      if (m['status_date']     !== undefined)          sheet.getRange(rn, m['status_date']     + 1).setValue(today);
      if (m['notes'] !== undefined){
        var prev = String(sheet.getRange(rn, m['notes'] + 1).getValue() || '');
        var note = '🛍️ Placed ' + today + (brand ? ' @ ' + brand : '') + (ref ? ' #' + ref : '') + (gmail ? ' via ' + gmail : '');
        sheet.getRange(rn, m['notes'] + 1).setValue(note + (prev ? ' || ' + prev : ''));
      }
      done.push(ids[k]);
    }
  }

  safeMail('🛍️ Placement linked — ' + (done.join(', ') || '(none matched)'),
    'Linked ' + done.length + ' order(s) to a brand placement.\n\n' +
    'Brand:     ' + brand + '\n' +
    'Order ref: ' + ref + '\n' +
    'Gmail:     ' + gmail + '\n' +
    'Orders:    ' + done.join(', ') + '\n');

  return json({ ok: true, linked: done });
}

// ── RUN THIS ONCE to grant permissions ──────────────────────────────────
// In the editor: pick "authorizeNow" in the function dropdown ▸ Run ▸ allow.
// Grants Sheets + Drive + Gmail access and sends you a confirmation email.
function authorizeNow(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();   // Sheets scope
  DriveApp.getRootFolder();                          // Drive scope (receipt slips)
  MailApp.sendEmail(OWNER_EMAIL, 'PakiPoshak ✅ Authorization OK',
    'Your order script is now authorized to save orders, store receipts, and email you.\nSheet: ' + ss.getName());
}

// Lets you test the deployment in a browser (visiting the /exec URL)
function doGet() {
  return ContentService.createTextOutput('PakiPoshak order intake is live ✓');
}
