// HTML要素を取得
const cameraView = document.getElementById('camera-view');
const resultView = document.getElementById('result-view');
const video = document.getElementById('camera-preview');
const canvas = document.getElementById('canvas');
const capturedImage = document.getElementById('captured-image');
const shutterBtn = document.getElementById('shutter-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const recaptureBtn = document.getElementById('recapture-btn');
const downloadLink = document.getElementById('download-link');

// 現在のカメラストリームを保持する変数
let currentStream;
// 現在のカメラモード（'user'はインカメラ, 'environment'はアウトカメラ）
let facingMode = 'environment';

// カメラを起動する関数
async function startCamera() {
    // 既存のストリームがあれば停止
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    try {
        const constraints = {
            video: {
                facingMode: facingMode
            },
            audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
    } catch (err) {
        console.error('カメラの起動に失敗しました:', err);
        alert('カメラを利用できませんでした。ブラウザのカメラアクセス許可を確認してください。');
    }
}

// 撮影ボタンの処理
shutterBtn.addEventListener('click', () => {
    // Canvasのサイズを映像に合わせる
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Canvasに現在の映像フレームを描画
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Canvasから画像データ(URL)を取得
    const dataUrl = canvas.toDataURL('image/png');
    
    // 結果を表示
    capturedImage.src = dataUrl;
    downloadLink.href = dataUrl;
    
    // 表示を切り替え
    cameraView.classList.add('hidden');
    resultView.classList.remove('hidden');
});

// カメラ切り替えボタンの処理
switchCameraBtn.addEventListener('click', () => {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    startCamera();
});

// 再撮影ボタンの処理
recaptureBtn.addEventListener('click', () => {
    // 表示を元に戻す
    resultView.classList.add('hidden');
    cameraView.classList.remove('hidden');
});

// ページが読み込まれたらカメラを起動
startCamera();
