// --- HTML要素の取得 ---
const cameraView = document.getElementById('camera-view');
const video = document.getElementById('camera-preview');
const shutterBtn = document.getElementById('shutter-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const canvas = document.getElementById('canvas');
const flashOverlay = document.getElementById('flash-overlay');
const resolutionBtn = document.getElementById('resolution-btn');
const blackoutBtn = document.getElementById('blackout-btn');
const blackoutOverlay = document.getElementById('blackout-overlay');
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
let isHighRes = false;

// --- カメラ機能 ---
async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    // 【バグ修正箇所】'environment'のハードコーディングをやめ、変数 facingMode を使うように修正
    const constraints = {
        video: {
            facingMode: facingMode, // ここを修正！
            width: isHighRes ? { ideal: 4096 } : undefined,
            height: isHighRes ? { ideal: 2160 } : undefined
        },
        audio: false
    };
    
    console.log(`${isHighRes ? '高画質' : '標準画質'}モード (${facingMode}) でカメラを起動します`);

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

// 静止画撮影の処理
function takePicture(useFlash = true) {
    if (!currentStream) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    photoStack.unshift(dataUrl);
    updateThumbnail();
    if (useFlash) triggerFlash();
}

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
shutterBtn.addEventListener('click', () => takePicture());

switchCameraBtn.addEventListener('click', () => {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    startCamera();
});

resolutionBtn.addEventListener('click', () => {
    isHighRes = !isHighRes;
    resolutionBtn.classList.toggle('is-high-res', isHighRes);
    startCamera();
});

thumbnailContainer.addEventListener('click', () => openGallery(0));
closeGalleryBtn.addEventListener('click', closeGallery);

// 【新機能】ブラックアウトモードのロジック
blackoutBtn.addEventListener('click', () => blackoutOverlay.classList.remove('hidden'));

let swipeState = { stage: 0, startY: 0, startTime: 0, timeout: null };
blackoutOverlay.addEventListener('touchstart', (e) => {
    swipeState.startY = e.changedTouches[0].clientY;
});
blackoutOverlay.addEventListener('touchend', (e) => {
    const deltaY = e.changedTouches[0].clientY - swipeState.startY;

    if (Math.abs(deltaY) < 10) { // 短いタップと判定
        takePicture(false); // フラッシュなしで撮影
        return;
    }
    
    // スワイプ方向を判定
    if (deltaY < -50) { // 上スワイプ
        if (swipeState.stage === 0) {
            swipeState.stage = 1; // ステージ1へ
            swipeState.timeout = setTimeout(() => { swipeState.stage = 0; }, 1000); // 1秒以内に次の操作がなければリセット
        }
    } else if (deltaY > 50) { // 下スワイプ
        if (swipeState.stage === 1) {
            clearTimeout(swipeState.timeout);
            swipeState.stage = 0;
            blackoutOverlay.classList.add('hidden'); // コマンド成功！モード解除
        }
    }
});

// ギャラリーでのスワイプ
let touchStartX = 0;
galleryView.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; });
galleryView.addEventListener('touchend', (e) => {
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
