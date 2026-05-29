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

// --- グローバル変数 ---
let currentStream;
let facingMode = 'environment';
let photoStack = []; // 各要素: { url: string, blob?: Blob }
let currentGalleryIndex = 0;
// iPhone系ならSE3向け最適化を有効にする（簡易検出）
const isiPhone = /iPhone/.test(navigator.userAgent || '');
const seOptimized = isiPhone; // 必要なら false にして無効化できます

// --- カメラ機能 ---
async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    // 【バグ修正箇所】'environment'のハードコーディングをやめ、変数 facingMode を使うように修正
    const constraints = {
        video: {
            facingMode: facingMode
        },
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
    // グレースケールの単純化配列を作る
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        // NTSC近似の重み
        gray[j] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    }

    // Laplacian-ish の合計絶対値をシャープネス指標にする
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

// 1フレームをキャプチャして imageData と dataURL を返す
async function captureFrame() {
    if (!currentStream) return null;
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const sharpness = computeSharpness(imageData);
    // JPEG に変換（品質を指定）
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const url = URL.createObjectURL(blob);
    return { url, blob, sharpness };
}

// 静止画撮影（複数フレーム取得して最もシャープな1枚を選択）
async function takePicture(useFlash = true, options = {}) {
    const { bypassPreWait = false } = options;
    if (!currentStream) return;
    const samples = seOptimized ? 5 : 5; // 将来差分があれば分けられる
    const delayMs = seOptimized ? 80 : 80;
    const preWait = (seOptimized && !bypassPreWait) ? 400 : 0; // SE向けにAFが落ち着くまで待つ
    const results = [];

    if (preWait > 0) {
        await new Promise(r => setTimeout(r, preWait));
    }

    for (let i = 0; i < samples; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const frame = await captureFrame();
        if (frame) results.push(frame);
        if (i < samples - 1) await new Promise(r => setTimeout(r, delayMs));
    }

    if (results.length === 0) return;
    results.sort((a, b) => b.sharpness - a.sharpness);
    const best = results[0];
    // オブジェクトで保存しておく（あとでダウンロード等しやすい）
    photoStack.unshift({ url: best.url, blob: best.blob });
    updateThumbnail();
    if (useFlash) triggerFlash();
}

// --- ギャラリー機能 ---
function updateThumbnail() {
    if (photoStack.length > 0) {
        thumbnailPreview.src = photoStack[0].url;
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
    galleryImage.src = photoStack[currentGalleryIndex].url;
    counter.textContent = `${currentGalleryIndex + 1} / ${photoStack.length}`;
}

// --- イベントリスナー ---
shutterBtn.addEventListener('click', () => takePicture());

switchCameraBtn.addEventListener('click', () => {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    startCamera();
});

// 解像度切替は削除されました

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
        takePicture(false, { bypassPreWait: true }); // フラッシュなしで即撮影
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
