// --- HTML要素の取得 ---
const cameraView = document.getElementById('camera-view');
const video = document.getElementById('camera-preview');
const shutterBtn = document.getElementById('shutter-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const canvas = document.getElementById('canvas');
const flashOverlay = document.getElementById('flash-overlay');
const resolutionBtn = document.getElementById('resolution-btn');

// ギャラリー関連の要素
const galleryView = document.getElementById('gallery-view');
const galleryImage = document.getElementById('gallery-image');
const closeGalleryBtn = document.getElementById('close-gallery-btn');
const thumbnailContainer = document.getElementById('thumbnail-container');
const thumbnailPreview = document.getElementById('thumbnail-preview');
const counter = document.getElementById('counter');

// --- グローバル変数 ---
let currentStream;
let facingMode = 'environment';
let photoStack = [];
let currentGalleryIndex = 0;
let isHighRes = false; // false = 標準画質, true = 高画質

// --- カメラ機能 ---
// startCamera関数を、以下の内容で【全体を書き換え】てください

async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    // --- ここからが重要な変更点 ---
    let constraints; // constraintsを定義
    if (isHighRes) {
        // 高画質モードのときの設定
        console.log("高画質モードでカメラを起動します");
        constraints = {
            video: {
                facingMode: 'environment',
                // ideal = "この解像度が理想"という要求。デバイスが対応していなくてもエラーになりにくい。
                width: { ideal: 4096 }, // 4K解像度を目標にする
                height: { ideal: 2160 }
            },
            audio: false
        };
    } else {
        // 標準画質モードのときの設定 (これまで通り)
        console.log("標準画質モードでカメラを起動します");
        constraints = {
            video: { facingMode: 'environment' },
            audio: false
        };
    }
    // --- ここまでが重要な変更点 ---

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
    } catch (err) {
        // ... (エラー処理は変更なし) ...
    }
}

function triggerFlash() {
    flashOverlay.classList.add('flash');
    setTimeout(() => {
        flashOverlay.classList.remove('flash');
    }, 200);
}

// --- 撮影処理 ---
shutterBtn.addEventListener('click', (event) => {
    // 【修正点】イベントの伝播を停止
    event.stopPropagation();
    
    if (!currentStream) {
        alert('カメラが起動していません。');
        return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    
    photoStack.unshift(dataUrl);
    updateThumbnail();
    triggerFlash();
});

// --- ギャラリー機能 ---
function updateThumbnail() {
    if (photoStack.length > 0) {
        thumbnailPreview.src = photoStack[0];
        thumbnailContainer.style.display = 'block';
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
}

function updateGalleryView() {
    galleryImage.src = photoStack[currentGalleryIndex];
    counter.textContent = `${currentGalleryIndex + 1} / ${photoStack.length}`;
}

// --- イベントリスナー ---
switchCameraBtn.addEventListener('click', (event) => {
    // 【最重要修正点】イベントの伝播を停止
    event.stopPropagation();

    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    startCamera();
});

resolutionBtn.addEventListener('click', () => {
    isHighRes = !isHighRes;

    // ボタンにクラスを付けたり外したりして、色を制御する
    if (isHighRes) {
        // 高画質モードになったら is-high-res クラスを追加
        resolutionBtn.classList.add('is-high-res');
    } else {
        // 標準画質モードになったら is-high-res クラスを削除
        resolutionBtn.classList.remove('is-high-res');
    }

    startCamera();
});

thumbnailContainer.addEventListener('click', (event) => {
    // 【修正点】イベントの伝播を停止
    event.stopPropagation();

    openGallery(0);
});

closeGalleryBtn.addEventListener('click', closeGallery);

video.addEventListener('click', () => {
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    if (capabilities.focusMode) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
        .catch(e => console.error('フォーカスの適用に失敗', e));
    }
});

let touchStartX = 0;
galleryView.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
});

galleryView.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const swipeDistance = touchEndX - touchStartX;
    if (swipeDistance > 50 && currentGalleryIndex > 0) {
        currentGalleryIndex--;
        updateGalleryView();
    } else if (swipeDistance < -50 && currentGalleryIndex < photoStack.length - 1) {
        currentGalleryIndex++;
        updateGalleryView();
    }
});

// --- 初期化 ---
startCamera();
