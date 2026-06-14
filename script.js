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

// 【追加】新機能用のUI要素を取得
const photoCountBadge = document.getElementById('photo-count-badge');
const savePdfBtn = document.getElementById('save-pdf-btn');
const deleteLastBtn = document.getElementById('delete-last-btn');
const clearAllBtn = document.getElementById('clear-all-btn');

// --- グローバル変数 ---
let currentStream;
let facingMode = 'environment';
// photoStack に dataUrl (Base64) も保持するように拡張
let photoStack = []; // 各要素: { url: string, blob: Blob, dataUrl: string }
let currentGalleryIndex = 0;
let galleryViewer = null; // 【追加】Viewer.jsのインスタンス用

// iPhone系ならSE3向け最適化を有効にする（簡易検出）
const isiPhone = /iPhone/.test(navigator.userAgent || '');
const seOptimized = isiPhone; 
const ANALYZE_WIDTH = 320;
const analyzeCanvas = document.createElement('canvas');
const analyzeCtx = analyzeCanvas.getContext('2d');

// --- カメラ機能 ---
async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    const constraints = {
        video: { facingMode: facingMode },
        audio: false
    };

    console.log(`カメラを起動します (${facingMode})`);

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
    } catch (err) {
        console.error("カメラ起動エラー:", err);
    }
}

function triggerFlash() {
    flashOverlay.classList.add('flash');
    setTimeout(() => { flashOverlay.classList.remove('flash'); }, 200);
}

// 画像のシャープネスを簡易計算する（Laplacian-ish なフィルタ）
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
            const lap = Math.abs(4 * center - top - bottom - left - right);
            sum += lap;
        }
    }
    return sum;
}

// 解析用フレーム
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
    const imageData = analyzeCtx.getImageData(0, 0, w, h);
    const sharpness = computeSharpness(imageData);
    return { sharpness };
}

// フル解像度で最終的にJPEGを生成する（1回だけ呼ぶ）
function captureFullResBlob() {
    return new Promise(resolve => {
        canvas.width = video.videoWidth || video.clientWidth;
        canvas.height = video.videoHeight || video.clientHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 【追加】PDF用に軽量なBase64データも同時に取得しておく
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            resolve({ url, blob, dataUrl }); // dataUrlを戻り値に追加
        }, 'image/jpeg', 0.85);
    });
}

// 静止画撮影（複数フレーム取得して最もシャープな1枚を選択）
async function takePicture(useFlash = true, options = {}) {
    const { bypassPreWait = false } = options;
    if (!currentStream) return;
    const samples = seOptimized ? 3 : 3;
    const delayMs = seOptimized ? 40 : 50;
    const preWait = (seOptimized && !bypassPreWait) ? 200 : 0;
    const results = [];

    if (preWait > 0) {
        await new Promise(r => setTimeout(r, preWait));
    }

    for (let i = 0; i < samples; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const frame = analyzeFrame();
        if (frame) results.push(frame);
        if (i < samples - 1) await new Promise(r => setTimeout(r, delayMs));
    }

    if (results.length === 0) return;
    
    results.sort((a, b) => b.sharpness - a.sharpness);
    
    const full = await captureFullResBlob();
    // photoStackの先頭（0番目）に最新画像が追加される
    photoStack.unshift({ url: full.url, blob: full.blob, dataUrl: full.dataUrl });
    
    updateThumbnail();
    if (useFlash) triggerFlash();
}

// --- 【新機能】写真管理・PDF化機能 ---

// 直前の1枚を削除（photoStackの先頭を削除）
if (deleteLastBtn) {
    deleteLastBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (photoStack.length === 0) return;
        if (confirm("直前に撮った写真を1枚削除しますか？")) {
            photoStack.shift(); // 先頭（最新）を削除
            updateThumbnail();
        }
    });
}

// 全て削除
if (clearAllBtn) {
    clearAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (photoStack.length === 0) return;
        if (confirm(`撮影したすべての写真 (${photoStack.length}枚) を削除しますか？`)) {
            photoStack = [];
            updateThumbnail();
        }
    });
}

// PDF保存
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

        // unshiftで保存されているので、古い順（時系列）にするためにreverseして処理
        const chronologicalStack = [...photoStack].reverse();

        chronologicalStack.forEach((photo, index) => {
            if (index > 0) doc.addPage();
            doc.addImage(photo.dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        });

        const now = new Date();
        const timestamp = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0');
            
        doc.save(`photos_${timestamp}.pdf`);
        alert("PDFを生成しました。");
    });
}


// --- ギャラリー機能 ---
function updateThumbnail() {
    if (photoStack.length > 0) {
        thumbnailPreview.src = photoStack[0].url;
        thumbnailContainer.style.display = 'block';
        if(photoCountBadge) {
            photoCountBadge.innerText = photoStack.length;
            photoCountBadge.classList.remove('hidden');
        }
    } else {
        thumbnailPreview.src = "";
        thumbnailContainer.style.display = 'none';
        if(photoCountBadge) photoCountBadge.classList.add('hidden');
    }
}

function openGallery(index) {
    if (photoStack.length === 0) return;
    currentGalleryIndex = index;
    updateGalleryView();
    cameraView.classList.add('hidden');
    galleryView.classList.remove('hidden');
}

function closeGallery() {
    galleryView.classList.add('hidden');
    cameraView.classList.remove('hidden');
    // メモリ節約のためViewerを破棄
    if (galleryViewer) {
        galleryViewer.destroy();
        galleryViewer = null;
    }
}

function updateGalleryView() {
    galleryImage.src = photoStack[currentGalleryIndex].url;
    // 最新がインデックス0なので、表示は「古い順」ではなく「新しい順」のインデックスになります
    counter.textContent = `${currentGalleryIndex + 1} / ${photoStack.length}`;

    // 【追加】Viewer.jsの初期化・再構築
    if (galleryViewer) {
        galleryViewer.destroy();
    }
    
    // 画像だけをピンチズーム・移動可能にする
    galleryViewer = new Viewer(galleryImage, {
        inline: true,
        button: false,
        navbar: false,
        title: false,
        toolbar: false,
        tooltip: false,
        movable: true,
        zoomable: true,
        rotatable: false,
        scalable: false,
        transition: false // スワイプ時のチラつきを防ぐためアニメーションをオフ
    });
}

// --- イベントリスナー ---
shutterBtn.addEventListener('click', () => takePicture());

switchCameraBtn.addEventListener('click', () => {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    startCamera();
});

thumbnailContainer.addEventListener('click', () => openGallery(0));
closeGalleryBtn.addEventListener('click', closeGallery);

// ブラックアウトモードのロジック
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

// ギャラリーでのスワイプ (Viewer.jsと競合しないようにラップ)
let touchStartX = 0;
galleryView.addEventListener('touchstart', (e) => { 
    // ピンチズーム中（指2本以上）はスワイプ判定を無視する
    if(e.touches.length > 1) return;
    touchStartX = e.changedTouches[0].screenX; 
});
galleryView.addEventListener('touchend', (e) => {
    if(e.changedTouches.length > 1) return;
    
    const deltaX = e.changedTouches[0].screenX - touchStartX;
    
    // Viewer.jsで画像がズームされている場合はスワイプを無効化（移動操作を優先）
    if (galleryViewer && galleryViewer.imageData.ratio > 1.1) return;

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
