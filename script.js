// --- HTML要素の取得 ---
const cameraView = document.getElementById('camera-view');
const video = document.getElementById('camera-preview');
const shutterBtn = document.getElementById('shutter-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const canvas = document.getElementById('canvas');
const flashOverlay = document.getElementById('flash-overlay');

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

// --- カメラ機能 ---
async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    try {
        const constraints = { video: { facingMode: facingMode }, audio: false };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
    } catch (err) {
        console.error('カメラの起動に失敗:', err);
        let message = 'カメラを利用できませんでした。\n';
        if (err.name === 'NotAllowedError') {
            message += 'カメラの使用が許可されていません。ブラウザまたはスマートフォンの設定で、このサイトへのカメラアクセスを許可してください。';
        } else if (err.name === 'NotFoundError') {
            message += '利用可能なカメラが見つかりませんでした。';
        } else {
            message += 'エラーが発生しました: ' + err.name;
        }
        alert(message);
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
