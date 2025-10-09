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
let photoStack = []; // 撮影した写真を保存する配列
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
        console.error('カメラの起動に失敗しました:', err);
        alert('カメラを利用できませんでした。ブラウザのカメラアクセス許可を確認してください。');
    }
}

// 控えめなフラッシュ効果
function triggerFlash() {
    flashOverlay.classList.add('flash');
    setTimeout(() => {
        flashOverlay.classList.remove('flash');
    }, 200); // 0.2秒でフラッシュを終了
}

// --- 撮影処理 ---
shutterBtn.addEventListener('click', () => {
    // 描画処理
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    
    // 写真をスタックの先頭に追加 (新しいものが常に0番目に来る)
    photoStack.unshift(dataUrl);
    
    // サムネイルを更新
    updateThumbnail();

    // フラッシュを実行
    triggerFlash();
});

// --- ギャラリー機能 ---
function updateThumbnail() {
    if (photoStack.length > 0) {
        thumbnailPreview.src = photoStack[0]; // 常に先頭（最新）の写真
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

// ギャラリーの表示を更新する関数
function updateGalleryView() {
    galleryImage.src = photoStack[currentGalleryIndex];
    counter.textContent = `${currentGalleryIndex + 1} / ${photoStack.length}`;
}

// --- イベントリスナー ---
switchCameraBtn.addEventListener('click', () => {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    startCamera();
});

// サムネイルをクリックしたらギャラリーを開く
thumbnailContainer.addEventListener('click', () => {
    openGallery(0); // 最新の写真（配列の0番目）から表示
});

// ギャラリーを閉じる
closeGalleryBtn.addEventListener('click', closeGallery);

// ギャラリーでのスワイプ機能
let touchStartX = 0;
galleryView.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
});

galleryView.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const swipeDistance = touchEndX - touchStartX;

    // スワイプ距離が50px以上の場合に写真を切り替え
    if (swipeDistance > 50) { // 右へスワイプ -> 前の写真へ
        if (currentGalleryIndex > 0) {
            currentGalleryIndex--;
            updateGalleryView();
        }
    } else if (swipeDistance < -50) { // 左へスワイプ -> 次の写真へ
        if (currentGalleryIndex < photoStack.length - 1) {
            currentGalleryIndex++;
            updateGalleryView();
        }
    }
});

// --- 初期化 ---
startCamera();
