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

// ── MAIN HANDLER (do not edit below) ────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // 1) Append a tracking row -------------------------------------------------
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_TAB) || ss.getSheets()[0];
    var today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Asia/Dhaka', 'yyyy-MM-dd');

    // Columns: order_id | buyer_name | whatsapp | status | status_date | notes
    sheet.appendRow([
      data.order_id   || '',
      data.buyer_name || '',
      data.whatsapp   || '',
      'order_received',
      today,
      'New order — awaiting payment'
    ]);

    // 2) Email the owner -------------------------------------------------------
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

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Lets you test the deployment in a browser (visiting the /exec URL)
function doGet() {
  return ContentService.createTextOutput('PakStyle order intake is live ✓');
}
