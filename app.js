// State Management
let currentStream = null;
let useFacingMode = 'environment';
let isCvReady = false;
let capturedPages = [];
let originalCanvas = null;
let currentRotation = 0;
let autoCaptureTimer = null;
let stableDetectionCount = 0;

// DOM Elements
const videoFeed = document.getElementById('videoFeed');
const overlayCanvas = document.getElementById('overlayCanvas');
const editorCanvas = document.getElementById('editorCanvas');
const captureBtn = document.getElementById('captureBtn');
const cvStatus = document.getElementById('cvStatus');
const editorCard = document.getElementById('editorCard');
const autoCaptureStatus = document.getElementById('autoCaptureStatus');
const captureTimer = document.getElementById('captureTimer');

// OpenCV Readiness Callback
function onOpenCvReady() {
  isCvReady = true;
  cvStatus.innerHTML = '<i class="fa-solid fa-check-circle"></i> Engine Siap';
  cvStatus.classList.add('ready');
  captureBtn.disabled = false;
  startCamera();
}

// Start Camera Stream
async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    videoFeed.srcObject = currentStream;
    videoFeed.onloadedmetadata = () => {
      videoFeed.play();
      startDocumentDetection();
    };
  } catch (err) {
    alert("Gagal mengakses kamera: " + err.message);
  }
}

// Toggle Camera Front/Back
document.getElementById('toggleCameraBtn').addEventListener('click', () => {
  useFacingMode = useFacingMode === 'environment' ? 'user' : 'environment';
  startCamera();
});

// Document Detection Loop via OpenCV
function startDocumentDetection() {
  const ctx = overlayCanvas.getContext('2d');
  
  function processFrame() {
    if (!isCvReady || videoFeed.paused || videoFeed.ended) {
      requestAnimationFrame(processFrame);
      return;
    }

    overlayCanvas.width = videoFeed.videoWidth;
    overlayCanvas.height = videoFeed.videoHeight;

    try {
      let src = cv.imread(videoFeed);
      let gray = new cv.Mat();
      let blurred = new cv.Mat();
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, gray, 75, 200);

      cv.findContours(gray, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let maxContour = null;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area > 10000 && area > maxArea) {
          maxArea = area;
          maxContour = cnt;
        }
      }

      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (maxContour) {
        stableDetectionCount++;
        if (stableDetectionCount > 15 && !autoCaptureTimer) {
          triggerAutoCapture();
        }
      } else {
        stableDetectionCount = 0;
        cancelAutoCapture();
      }

      src.delete(); gray.delete(); blurred.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.log(e);
    }

    requestAnimationFrame(processFrame);
  }

  requestAnimationFrame(processFrame);
}

// Auto Capture Countdown
function triggerAutoCapture() {
  autoCaptureStatus.classList.remove('hidden');
  let timeLeft = 3;
  captureTimer.textContent = timeLeft;

  autoCaptureTimer = setInterval(() => {
    timeLeft--;
    captureTimer.textContent = timeLeft;
    if (timeLeft <= 0) {
      cancelAutoCapture();
      captureFrame();
    }
  }, 1000);
}

function cancelAutoCapture() {
  if (autoCaptureTimer) {
    clearInterval(autoCaptureTimer);
    autoCaptureTimer = null;
    autoCaptureStatus.classList.add('hidden');
  }
}

// Capture Frame to Editor
captureBtn.addEventListener('click', captureFrame);

function captureFrame() {
  cancelAutoCapture();
  
  const canvas = document.createElement('canvas');
  canvas.width = videoFeed.videoWidth;
  canvas.height = videoFeed.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoFeed, 0, 0);

  originalCanvas = canvas;
  currentRotation = 0;
  applyImageFilters();
  
  editorCard.classList.remove('hidden');
  editorCard.scrollIntoView({ behavior: 'smooth' });
}

// File Upload
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    originalCanvas = canvas;
    currentRotation = 0;
    applyImageFilters();
    
    editorCard.classList.remove('hidden');
    editorCard.scrollIntoView({ behavior: 'smooth' });
  };
  img.src = URL.createObjectURL(file);
});

// Image Filters Processing
function applyImageFilters() {
  if (!originalCanvas) return;

  const activeFilter = document.querySelector('.filter-chip.active').dataset.filter;
  const brightness = parseInt(document.getElementById('brightnessSlider').value);
  const contrast = parseInt(document.getElementById('contrastSlider').value);
  const watermarkText = document.getElementById('watermarkText').value;

  const ctx = editorCanvas.getContext('2d');
  editorCanvas.width = originalCanvas.width;
  editorCanvas.height = originalCanvas.height;

  let mat = cv.imread(originalCanvas);

  // Rotate
  if (currentRotation !== 0) {
    if (currentRotation === 90) cv.rotate(mat, mat, cv.ROTATE_90_CLOCKWISE);
    if (currentRotation === 180) cv.rotate(mat, mat, cv.ROTATE_180);
    if (currentRotation === 270) cv.rotate(mat, mat, cv.ROTATE_90_COUNTERCLOCKWISE);
  }

  // Filters
  if (activeFilter === 'bw') {
    cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY);
    cv.threshold(mat, mat, 128, 255, cv.THRESH_BINARY);
  } else if (activeFilter === 'adaptive') {
    cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(mat, mat, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
  } else if (activeFilter === 'gray') {
    cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY);
  } else if (activeFilter === 'magic') {
    cv.convertScaleAbs(mat, mat, 1.2, 10);
  }

  // Brightness & Contrast Adjustment
  if (brightness !== 0 || contrast !== 0) {
    let alpha = (contrast + 100) / 100;
    let beta = brightness;
    mat.convertTo(mat, -1, alpha, beta);
  }

  cv.imshow(editorCanvas, mat);
  mat.delete();

  // Watermark
  if (watermarkText) {
    ctx.font = "bold 36px Arial";
    ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(editorCanvas.width / 2, editorCanvas.height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.fillText(watermarkText, 0, 0);
    ctx.restore();
  }
}

// Filter Event Listeners
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    applyImageFilters();
  });
});

['brightnessSlider', 'contrastSlider'].forEach(id => {
  document.getElementById(id).addEventListener('input', applyImageFilters);
});

document.getElementById('watermarkText').addEventListener('input', applyImageFilters);
document.getElementById('watermarkPreset').addEventListener('change', (e) => {
  document.getElementById('watermarkText').value = e.target.value;
  applyImageFilters();
});

document.getElementById('rotateBtn').addEventListener('click', () => {
  currentRotation = (currentRotation + 90) % 360;
  applyImageFilters();
});

// Run AI OCR
document.getElementById('runOcrBtn').addEventListener('click', async () => {
  const ocrBox = document.getElementById('ocrResultBox');
  const ocrOutput = document.getElementById('ocrOutput');
  
  ocrBox.classList.remove('hidden');
  ocrOutput.value = "Menganalisis teks dengan AI OCR...";

  try {
    const worker = await Tesseract.createWorker('ind');
    const ret = await worker.recognize(editorCanvas);
    ocrOutput.value = ret.data.text || "Tidak ada teks yang terdeteksi.";
    await worker.terminate();
  } catch (err) {
    ocrOutput.value = "Gagal membaca teks: " + err.message;
  }
});

document.getElementById('copyOcrBtn').addEventListener('click', () => {
  const ocrOutput = document.getElementById('ocrOutput');
  ocrOutput.select();
  document.execCommand('copy');
  alert("Teks berhasil disalin!");
});

// Queue Management
document.getElementById('addPageBtn').addEventListener('click', () => {
  const dataUrl = editorCanvas.toDataURL('image/jpeg');
  capturedPages.push(dataUrl);
  updateQueueUI();
  editorCard.classList.add('hidden');
});

function updateQueueUI() {
  const queueThumbnails = document.getElementById('queueThumbnails');
  document.getElementById('pageCount').textContent = capturedPages.length;

  if (capturedPages.length === 0) {
    queueThumbnails.innerHTML = '<div class="empty-state">Belum ada halaman yang ditambahkan.</div>';
    return;
  }

  queueThumbnails.innerHTML = capturedPages.map((page, index) => `
    <div class="thumbnail-item">
      <img src="${page}">
      <button class="remove-btn" onclick="removePage(${index})">&times;</button>
    </div>
  `).join('');
}

window.removePage = function(index) {
  capturedPages.splice(index, 1);
  updateQueueUI();
};

document.getElementById('clearQueueBtn').addEventListener('click', () => {
  capturedPages = [];
  updateQueueUI();
});

// Exports
document.getElementById('exportPdfBtn').addEventListener('click', () => {
  if (capturedPages.length === 0) return alert("Tambahkan minimal 1 halaman!");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  capturedPages.forEach((page, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(page, 'JPEG', 10, 10, 190, 270);
  });

  pdf.save('Tools-All-Scanner.pdf');
});

document.getElementById('exportTxtBtn').addEventListener('click', () => {
  const text = document.getElementById('ocrOutput').value;
  if (!text) return alert("Jalankan OCR terlebih dahulu untuk mengekstrak teks!");
  
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "Hasil-Teks-OCR.txt";
  a.click();
});

document.getElementById('exportZipBtn').addEventListener('click', async () => {
  if (capturedPages.length === 0) return alert("Tambahkan minimal 1 halaman!");
  const zip = new JSZip();

  capturedPages.forEach((page, i) => {
    const base64Data = page.replace(/^data:image\/jpeg;base64,/, "");
    zip.file(`Halaman-${i + 1}.jpg`, base64Data, { base64: true });
  });

  const content = await zip.generateAsync({ type: "blob" });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = "Kumpulan-Gambar-Dokumen.zip";
  a.click();
});