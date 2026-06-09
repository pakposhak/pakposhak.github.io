/****************************************************************************
 * PakStyle BD — Order Intake Script
 * --------------------------------------------------------------------------
 * WHAT THIS DOES
 *   When a customer submits the order form, this script:
 *     1. Adds a new row to your "Order Tracker" sheet (so tracking works)
 *     2. Emails YOU the full order details (from your own Gmail = never spam)
 *
 * ───────────────────────── HOW TO SET UP (one time) ─────────────────────────
 *  1. Open your tracking Google Sheet (PakStyle_BD_Order_Tracker)
 *  2. Top menu:  Extensions  →  Apps Script
 *  3. Delete anything in the editor, then PASTE this entire file
 *  4. Click the  💾 Save  icon (name it e.g. "Order Intake")
 *  5. Click  Deploy  →  New deployment
 *  6. Click the gear ⚙ next to "Select type"  →  choose  Web app
 *  7. Settings:
 *        Description:      Order intake
 *        Execute as:       Me (your email)
 *        Who has access:   Anyone            ← IMPORTANT, must be "Anyone"
 *  8. Click  Deploy  →  Authorize access  →  pick your Google account
 *        (If it warns "Google hasn't verified this app":
 *         click "Advanced" → "Go to Order Intake (unsafe)" → Allow.
 *         It's YOUR own script, so this is safe.)
 *  9. COPY the "Web app URL" it gives you (ends in /exec)
 * 10. Send that URL to Claude (or paste it into order-form.html as
 *        SHEET_SCRIPT_URL near the top of the <script> section)
 ****************************************************************************/

// ── CONFIG ──────────────────────────────────────────────────────────────
var OWNER_EMAIL = 'collectionmoors@gmail.com';   // where order emails go
var SHEET_TAB   = 'Order Tracker';               // the tab with your columns

var SLIP_FOLDER = 'PakStyle Payment Slips';        // Drive folder for receipts

// ── MAIN HANDLER (do not edit below) ────────────────────────────────────
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_TAB) || ss.getSheets()[0];
    var today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Asia/Dhaka', 'yyyy-MM-dd');

    // Branch: a payment confirmation, or a brand-new order
    if (data.type === 'payment') {
      return handlePayment(data, sheet, today);
    }
    return handleNewOrder(data, sheet, today);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── NEW ORDER → append row + email owner ────────────────────────────────
function handleNewOrder(data, sheet, today) {
  // Ensure headers for the extra columns the aggregator reads (G,H,I)
  var hdr = sheet.getRange(1, 1, 1, Math.max(9, sheet.getLastColumn())).getValues()[0];
  function setHdr(col, name){ if (String(hdr[col-1] || '').trim() === '') sheet.getRange(1, col).setValue(name); }
  setHdr(7, 'receipt_url'); setHdr(8, 'order_items'); setHdr(9, 'cart_links');

  // Columns: order_id|buyer_name|whatsapp|status|status_date|notes|receipt_url|order_items|cart_links
  sheet.appendRow([
    data.order_id   || '',
    data.buyer_name || '',
    data.whatsapp   || '',
    'order_received',
    today,
    'New order — awaiting payment',
    '',
    data.order_items || '',
    data.cart_links  || ''
  ]);

  var subject = 'New PakStyle Order ' + (data.order_id || '') + ' — ' + (data.buyer_name || '');
  var body =
    'NEW ORDER RECEIVED\n' +
    '====================\n\n' +
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
    '— Tracking row was added automatically.';
  MailApp.sendEmail(OWNER_EMAIL, subject, body);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── PAYMENT CONFIRMATION → save slip to Drive + update order row ─────────
function handlePayment(data, sheet, today) {
  var orderId = String(data.order_id || '').trim().toUpperCase();
  var msg     = String(data.payment_message || '').trim();

  // 1) Save the receipt image to Drive (if one was sent)
  var receiptUrl = '';
  if (data.receipt_base64) {
    var folders = DriveApp.getFoldersByName(SLIP_FOLDER);
    var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(SLIP_FOLDER);
    var bytes   = Utilities.base64Decode(data.receipt_base64);
    var blob    = Utilities.newBlob(bytes, data.receipt_type || 'image/jpeg',
                    (orderId || 'receipt') + '_' + Date.now() + '.jpg');
    var file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    receiptUrl  = file.getUrl();
  }

  // 2) Locate the order row by order_id
  var values  = sheet.getDataRange().getValues();
  var headers = values[0].map(function (h) {
    return String(h).trim().toLowerCase().replace(/\s+/g, '_');
  });
  var cId   = headers.indexOf('order_id');
  var cStat = headers.indexOf('status');
  var cDate = headers.indexOf('status_date');
  var cNote = headers.indexOf('notes');
  var cRcpt = headers.indexOf('receipt_url');
  if (cRcpt === -1) {                       // auto-create the column if missing
    cRcpt = headers.length;
    sheet.getRange(1, cRcpt + 1).setValue('receipt_url');
  }

  var rowNum = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][cId]).trim().toUpperCase() === orderId) { rowNum = i + 1; break; }
  }

  var noteText = '💰 Payment submitted ' + today + (msg ? ' | ' + msg : '');
  if (rowNum > 0) {
    if (cStat >= 0) sheet.getRange(rowNum, cStat + 1).setValue('payment_received');
    if (cDate >= 0) sheet.getRange(rowNum, cDate + 1).setValue(today);
    if (cNote >= 0) {
      var prev = String(sheet.getRange(rowNum, cNote + 1).getValue() || '');
      sheet.getRange(rowNum, cNote + 1).setValue(noteText + (prev ? ' || ' + prev : ''));
    }
    if (receiptUrl) sheet.getRange(rowNum, cRcpt + 1).setValue(receiptUrl);
  } else {
    // Order not in sheet yet → append a payment-only row so nothing is lost
    var row = [];
    row[cId]   = data.order_id || '';
    row[cStat] = 'payment_received';
    row[cDate] = today;
    row[cNote] = noteText + ' (order row not found)';
    row[cRcpt] = receiptUrl;
    for (var j = 0; j <= cRcpt; j++) if (row[j] === undefined) row[j] = '';
    sheet.appendRow(row);
  }

  // 3) Email the owner
  MailApp.sendEmail(
    OWNER_EMAIL,
    '💰 Payment submitted — ' + orderId,
    'A customer submitted payment confirmation.\n\n' +
    'Order ID: ' + orderId + '\n' +
    'Message:  ' + (msg || '(none)') + '\n' +
    'Receipt:  ' + (receiptUrl || '(no image attached)') + '\n'
  );

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, receiptUrl: receiptUrl }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lets you test the deployment in a browser (visiting the /exec URL)
function doGet() {
  return ContentService.createTextOutput('PakStyle order intake is live ✓');
}
