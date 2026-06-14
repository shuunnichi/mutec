// --- HTML要素の取得 ---
const cameraView = document.getElementById('camera-view');
const video = document.getElementById('camera-preview');
const shutterBtn = document.getElementById('shutter-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const canvas = document.getElementById('canvas');
const flashOverlay = document.getElementById('flash-overlay');
const blackoutBtn = document.getElementById('blackout-btn');
const blackoutOverlay = document.getElementById('blackout-overlay');
const galleryView = document.getElementById('gallery-view');
const galleryImage = document.getElementById('gallery-image');
const closeGalleryBtn = document.getElementById('close-gallery-btn');
const thumbnailContainer = document.getElementById('thumbnail-container');
const thumbnailPreview = document.getElementById('thumbnail-preview');
const counter = document.getElementById('counter');

// 新機能用要素
const photoCountBadge = document.getElementById('photo-count-badge');
const savePdfBtn = document.getElementById('save-pdf-btn');
const deleteLastBtn = document.getElementById('delete-last-btn');
const clearAllBtn = document.getElementById('clear-all-btn');

// --- グローバル変数 ---
let currentStream;
let facingMode = 'environment';
let photoStack = []; // 各要素: { url: string, blob: Blob, dataUrl: string }
let currentGalleryIndex = 0;
let galleryViewer = null; // Viewer.js用

const isiPhone = /iPhone/.test(navigator.userAgent || '');
const seOptimized = isiPhone;
const ANALYZE_WIDTH = 320;
const analyzeCanvas = document.createElement('canvas');
const analyzeCtx = analyzeCanvas.getContext('2d');

// --- カメラ機能 ---
async function startCamera() {
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());
    const constraints = { video: { facingMode: facingMode }, audio: false };
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
    } catch (err) {
        console.error("カメラ起動エラー:", err);
    }
}

function triggerFlash() {
    flashOverlay.style.opacity = '1';
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 200);
}

function computeSharpness(imageData) {
    const { data, width, height } = imageData;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        gray[j] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    }
    let sum = 0;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const center = gray[idx];
            const top = gray[idx - width];
            const bottom = gray[idx + width];
            const left = gray[idx - 1];
            const right = gray[idx + 1];
            sum += Math.abs(4 * center - top - bottom - left - right);
        }
    }
    return sum;
}

function analyzeFrame() {
    if (!currentStream) return null;
    const videoW = video.videoWidth || video.clientWidth || 640;
    const videoH = video.videoHeight || video.clientHeight || 480;
    const ratio = videoH / videoW;
    const w = ANALYZE_WIDTH;
    const h = Math.max(1, Math.round(w * ratio));
    analyzeCanvas.width = w;
    analyzeCanvas.height = h;
    analyzeCtx.drawImage(video, 0, 0, w, h);
    return { sharpness: computeSharpness(analyzeCtx.getImageData(0, 0, w, h)) };
}

function captureFullResBlob() {
    return new Promise(resolve => {
        canvas.width = video.videoWidth || video.clientWidth;
        canvas.height = video.videoHeight || video.clientHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // PDF用にDataURL(Base64)も一緒に生成する
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            resolve({ url, blob, dataUrl });
        }, 'image/jpeg', 0.85);
    });
}

async function takePicture(useFlash = true, options = {}) {
    const { bypassPreWait = false } = options;
    if (!currentStream) return;
    const samples = seOptimized ? 3 : 3;
    const delayMs = seOptimized ? 40 : 50;
    const preWait = (seOptimized && !bypassPreWait) ? 200 : 0;
    const results = [];

    if (preWait > 0) await new Promise(r => setTimeout(r, preWait));

    for (let i = 0; i < samples; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const frame = analyzeFrame();
        if (frame) results.push(frame);
        if (i < samples - 1) await new Promise(r => setTimeout(r, delayMs));
    }

    if (results.length === 0) return;
    results.sort((a, b) => b.sharpness - a.sharpness);
    
    const full = await captureFullResBlob();
    photoStack.unshift({ url: full.url, blob: full.blob, dataUrl: full.dataUrl });
    
    updateThumbnail();
    if (useFlash) triggerFlash();
}

// --- ボタン機能（削除・PDF） ---
if (deleteLastBtn) {
    deleteLastBtn.addEventListener('click', () => {
        if (photoStack.length === 0) return;
        if (confirm("直前に撮った写真を1枚削除しますか？")) {
            photoStack.shift();
            updateThumbnail();
        }
    });
}

if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
        if (photoStack.length === 0) return;
        if (confirm(`すべての写真 (${photoStack.length}枚) を削除しますか？`)) {
            photoStack = [];
            updateThumbnail();
        }
    });
}

if (savePdfBtn) {
    savePdfBtn.addEventListener('click', () => {
        if (photoStack.length === 0) {
            alert("PDFにする写真がありません。");
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = doc.internal.pageSize.getHeight();

        // 撮影順（古い順）にPDF化するため配列を反転させる
        const chronologicalStack = [...photoStack].reverse();

        chronologicalStack.forEach((photo, index) => {
            if (index > 0) doc.addPage();
            doc.addImage(photo.dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        });

        const now = new Date();
        const timestamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0');
            
        doc.save(`photos_${timestamp}.pdf`);
    });
}

// --- ギャラリー機能 ---
function updateThumbnail() {
    if (photoStack.length > 0) {
        thumbnailPreview.src = photoStack[0].url;
        thumbnailContainer.style.display = 'block';
        if (photoCountBadge) {
            photoCountBadge.innerText = photoStack.length;
            photoCountBadge.classList.remove('hidden');
        }
    } else {
        thumbnailPreview.src = "";
        thumbnailContainer.style.display = 'none';
        if (photoCountBadge) photoCountBadge.classList.add('hidden');
    }
}

function openGallery(index) {
    if (photoStack.length === 0) return;
    currentGalleryIndex = index;
    cameraView.classList.add('hidden');
    galleryView.classList.remove('hidden');
    updateGalleryView();
}

function closeGallery() {
    galleryView.classList.add('hidden');
    cameraView.classList.remove('hidden');
    if (galleryViewer) {
        galleryViewer.destroy();
        galleryViewer = null;
    }
}

function updateGalleryView() {
    galleryImage.src = photoStack[currentGalleryIndex].url;
    counter.textContent = `${currentGalleryIndex + 1} / ${photoStack.length}`;

    // Viewer.jsが読み込めているか確認して初期化
    if (typeof Viewer !== 'undefined') {
        if (galleryViewer) galleryViewer.destroy();
        galleryViewer = new Viewer(galleryImage, {
            inline: true, button: false, navbar: false, title: false,
            toolbar: false, tooltip: false, movable: true, zoomable: true,
            rotatable: false, scalable: false, transition: false
        });
    }
}

// --- イベントリスナー ---
shutterBtn.addEventListener('click', () => takePicture());

switchCameraBtn.addEventListener('click', () => {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    startCamera();
});

thumbnailContainer.addEventListener('click', () => openGallery(0));
closeGalleryBtn.addEventListener('click', closeGallery);

// ブラックアウトモード
blackoutBtn.addEventListener('click', () => blackoutOverlay.classList.remove('hidden'));

let swipeState = { stage: 0, startY: 0, startTime: 0, timeout: null };
blackoutOverlay.addEventListener('touchstart', (e) => {
    swipeState.startY = e.changedTouches[0].clientY;
});
blackoutOverlay.addEventListener('touchend', (e) => {
    const deltaY = e.changedTouches[0].clientY - swipeState.startY;
    if (Math.abs(deltaY) < 10) { 
        takePicture(false, { bypassPreWait: true });
        return;
    }
    if (deltaY < -50) { 
        if (swipeState.stage === 0) {
            swipeState.stage = 1; 
            swipeState.timeout = setTimeout(() => { swipeState.stage = 0; }, 1000); 
        }
    } else if (deltaY > 50) { 
        if (swipeState.stage === 1) {
            clearTimeout(swipeState.timeout);
            swipeState.stage = 0;
            blackoutOverlay.classList.add('hidden'); 
        }
    }
});

// ギャラリーでのスワイプ (Viewer.jsと競合しないよう調整)
let touchStartX = 0;
galleryView.addEventListener('touchstart', (e) => { 
    if(e.touches.length > 1) return; // ピンチ操作中は無視
    touchStartX = e.changedTouches[0].screenX; 
});
galleryView.addEventListener('touchend', (e) => {
    if(e.changedTouches.length > 1) return;
    
    // 拡大中はスワイプを無効化（画像移動を優先）
    if (galleryViewer && galleryViewer.imageData && galleryViewer.imageData.ratio > 1.05) return;

    const deltaX = e.changedTouches[0].screenX - touchStartX;
    if (deltaX > 50 && currentGalleryIndex > 0) {
        currentGalleryIndex--;
        updateGalleryView();
    } else if (deltaX < -50 && currentGalleryIndex < photoStack.length - 1) {
        currentGalleryIndex++;
        updateGalleryView();
    }
});

// --- 初期化 ---
startCamera();
