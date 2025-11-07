// Basic state
let items = [];
let stream = null;
let scanning = false;
let barcodeDetector = null;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startBtn = document.getElementById("start-scan");
const stopBtn = document.getElementById("stop-scan");
const statusEl = document.getElementById("scanner-status");

const barcodeInput = document.getElementById("barcode");
const qtyInput = document.getElementById("quantity");
const uomInput = document.getElementById("uom");
const locInput = document.getElementById("location");

const entryForm = document.getElementById("entry-form");
const clearCurrentBtn = document.getElementById("clear-current");

const itemsBody = document.getElementById("items-body");
const exportBtn = document.getElementById("export-csv");
const clearAllBtn = document.getElementById("clear-all");

// Load items from localStorage if present
(function loadSavedItems() {
  try {
    const saved = localStorage.getItem("shelf_scanner_items");
    if (saved) {
      items = JSON.parse(saved);
      renderTable();
    }
  } catch (e) {
    console.error("Error loading saved items", e);
  }
})();

// Save items to localStorage
function persistItems() {
  try {
    localStorage.setItem("shelf_scanner_items", JSON.stringify(items));
  } catch (e) {
    console.error("Error saving items", e);
  }
}

// Initialize BarcodeDetector if available
if ("BarcodeDetector" in window) {
  try {
    barcodeDetector = new BarcodeDetector({
      formats: [
        "code_128",
        "code_39",
        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "qr_code"
      ]
    });
    statusEl.textContent = "BarcodeDetector supported: you can scan with the camera.";
  } catch (e) {
    console.warn("BarcodeDetector init failed", e);
    barcodeDetector = null;
    statusEl.textContent = "BarcodeDetector not available. Enter barcodes manually.";
  }
} else {
  statusEl.textContent = "BarcodeDetector not supported. Enter barcodes manually.";
}

// Start camera & scanning
startBtn.addEventListener("click", async () => {
  if (!barcodeDetector) {
    alert("BarcodeDetector not supported on this device. You can still enter barcodes manually.");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    video.srcObject = stream;
    await video.play();

    scanning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = "Scanner running. Point at a barcode.";

    scanLoop();
  } catch (err) {
    console.error(err);
    alert("Could not start camera: " + err.message);
  }
});

// Stop camera & scanning
stopBtn.addEventListener("click", () => {
  stopScanning();
});

function stopScanning() {
  scanning = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  statusEl.textContent = "Scanner stopped.";
}

// Continuous scan loop
async function scanLoop() {
  if (!scanning || !barcodeDetector || !video.videoWidth) {
    if (scanning) {
      requestAnimationFrame(scanLoop);
    }
    return;
  }

  try {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const bitmap = await createImageBitmap(canvas);
    const barcodes = await barcodeDetector.detect(bitmap);

    if (barcodes.length > 0) {
      const value = barcodes[0].rawValue || barcodes[0].value;
      if (value) {
        handleDetectedBarcode(value);
      }
    }
  } catch (e) {
    // Fail silently per frame to avoid constant alerts
    console.warn("Scan error", e);
  }

  if (scanning) {
    requestAnimationFrame(scanLoop);
  }
}

let lastBarcode = "";
let lastDetectedTime = 0;

function handleDetectedBarcode(value) {
  const now = Date.now();
  // Avoid constant repeated triggers of the same code
  if (value === lastBarcode && now - lastDetectedTime < 1500) {
    return;
  }
  lastBarcode = value;
  lastDetectedTime = now;

  barcodeInput.value = value;
  qtyInput.focus();
  statusEl.textContent = "Barcode detected: " + value;
}

// Handle form submit (save line)
entryForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const barcode = barcodeInput.value.trim();
  let qty = qtyInput.value.trim();
  const uom = uomInput.value.trim();
  const loc = locInput.value.trim();

  if (!barcode) {
    alert("Barcode is required.");
    return;
  }
  if (!qty) {
    alert("Quantity is required.");
    return;
  }

  qty = Number(qty);
  if (Number.isNaN(qty) || qty < 0) {
    alert("Quantity must be a valid number.");
    return;
  }

  const timestamp = new Date().toISOString();

  items.push({
    timestamp,
    barcode,
    quantity: qty,
    uom,
    location: loc
  });

  persistItems();
  renderTable();
  clearCurrentInputs(true);
});

// Clear current inputs
clearCurrentBtn.addEventListener("click", () => {
  clearCurrentInputs(false);
});

function clearCurrentInputs(keepBarcode) {
  if (!keepBarcode) {
    barcodeInput.value = "";
  }
  qtyInput.value = "";
  uomInput.value = "";
  locInput.value = "";
}

// Render table
function renderTable() {
  itemsBody.innerHTML = "";
  items.forEach((item, index) => {
    const tr = document.createElement("tr");

    const idxTd = document.createElement("td");
    idxTd.textContent = index + 1;

    const tsTd = document.createElement("td");
    tsTd.textContent = item.timestamp;

    const bcTd = document.createElement("td");
    bcTd.textContent = item.barcode;

    const qtyTd = document.createElement("td");
    qtyTd.textContent = item.quantity;

    const uomTd = document.createElement("td");
    uomTd.textContent = item.uom || "";

    const locTd = document.createElement("td");
    locTd.textContent = item.location || "";

    tr.appendChild(idxTd);
    tr.appendChild(tsTd);
    tr.appendChild(bcTd);
    tr.appendChild(qtyTd);
    tr.appendChild(uomTd);
    tr.appendChild(locTd);

    itemsBody.appendChild(tr);
  });
}

// Export CSV
exportBtn.addEventListener("click", () => {
  if (items.length === 0) {
    alert("No items to export.");
    return;
  }

  const header = ["Timestamp", "Barcode", "Quantity", "UnitOfMeasure", "Location"];
  const rows = [header];

  items.forEach(item => {
    rows.push([
      item.timestamp,
      item.barcode,
      item.quantity,
      item.uom || "",
      item.location || ""
    ]);
  });

  const csvContent = rows
    .map(row => row.map(csvEscape).join(","))
    .join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const dateStr = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
  a.href = url;
  a.download = `shelf_scanner_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Clear all data
clearAllBtn.addEventListener("click", () => {
  if (!confirm("Clear all scanned lines?")) return;
  items = [];
  persistItems();
  renderTable();
});

// Clean up camera if user leaves page
window.addEventListener("beforeunload", stopScanning);
