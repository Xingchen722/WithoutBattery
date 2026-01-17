const messagesContainer = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const timerDisplay = document.getElementById("timer-display");
const statusLabel = document.getElementById("status-label");
const pauseBtn = document.getElementById("pause-btn");
const restartBtn = document.getElementById("restart-btn");
const themeToggleBtn = document.getElementById("theme-toggle");
const floatingTimer = document.getElementById("floating-timer");
const appContainer = document.getElementById("app");
const cameraToggleBtn = document.getElementById("camera-toggle");
const cameraStatus = document.getElementById("camera-status");
const cameraFeed = document.getElementById("camera-feed");

// --- 状态变量 ---
const INACTIVITY_LIMIT = 100; 
let lastActivityAt = Date.now();
let totalWorkSeconds = 0; // 累计工作时长
let isPunishing = false;
let isPaused = false;
let punishmentInterval = null;
let audioContext = null;
let currentOsc = null;
const punishmentReasons = new Set();

// --- 核心计时循环 (每秒执行) ---
setInterval(() => {
    const now = Date.now();

    if (isPaused) {
        statusLabel.innerText = "☕ RESTING";
        lastActivityAt = now; // 休息时重置空闲检测
        return;
    }

    const idleMs = now - lastActivityAt;

    if (!isPunishing) {
        statusLabel.innerText = "🔥 WORKING";
        totalWorkSeconds++; // 仅在工作且未受罚时累加
        timerDisplay.innerText = formatTime(totalWorkSeconds);

        if (idleMs >= INACTIVITY_LIMIT * 1000) {
            triggerPunishment("idle");
        }
    } else {
        statusLabel.innerText = "⚠️ IDLE!";
        timerDisplay.innerText = "!!!!";
    }
}, 1000);

// --- 按钮逻辑 ---
let isDraggingTimer = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setTimerPosition(left, top) {
    const maxLeft = window.innerWidth - floatingTimer.offsetWidth;
    const maxTop = window.innerHeight - floatingTimer.offsetHeight;
    floatingTimer.style.left = `${clamp(left, 0, maxLeft)}px`;
    floatingTimer.style.top = `${clamp(top, 0, maxTop)}px`;
    floatingTimer.style.right = "auto";
}

function initTimerPosition() {
    const saved = localStorage.getItem("timer-pos");
    if (saved) {
        try {
            const { left, top } = JSON.parse(saved);
            if (typeof left === "number" && typeof top === "number") {
                setTimerPosition(left, top);
                return;
            }
        } catch (_) {}
    }
    const rect = appContainer.getBoundingClientRect();
    setTimerPosition(rect.right + 16, rect.top + 24);
}

function onDragStart(e) {
    if (e.target.closest("button") || e.target.closest("input")) return;
    isDraggingTimer = true;
    floatingTimer.classList.add("dragging");
    const rect = floatingTimer.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragOffsetX = clientX - rect.left;
    dragOffsetY = clientY - rect.top;
}

function onDragMove(e) {
    if (!isDraggingTimer) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const nextLeft = clientX - dragOffsetX;
    const nextTop = clientY - dragOffsetY;
    setTimerPosition(nextLeft, nextTop);
}

function onDragEnd() {
    if (!isDraggingTimer) return;
    isDraggingTimer = false;
    floatingTimer.classList.remove("dragging");
    const rect = floatingTimer.getBoundingClientRect();
    localStorage.setItem("timer-pos", JSON.stringify({ left: rect.left, top: rect.top }));
}

floatingTimer.addEventListener("mousedown", onDragStart);
floatingTimer.addEventListener("touchstart", onDragStart, { passive: true });
document.addEventListener("mousemove", onDragMove);
document.addEventListener("touchmove", onDragMove, { passive: true });
document.addEventListener("mouseup", onDragEnd);
document.addEventListener("touchend", onDragEnd);
window.addEventListener("resize", () => {
    const rect = floatingTimer.getBoundingClientRect();
    setTimerPosition(rect.left, rect.top);
});

initTimerPosition();

// --- 摄像头闭眼检测 ---
let isCameraOn = false;
let camera = null;
let faceMesh = null;
let isCameraInitializing = false;
let lastDetectAt = 0;
const DETECT_INTERVAL_MS = 120; // ~8 FPS
let hands = null;
let lastHandDetectAt = 0;
const HAND_DETECT_INTERVAL_MS = 180; // ~5 FPS
let waveSamples = [];
let waveCooldownUntil = 0;
let eyeClosedFrames = 0;
const EYE_CLOSED_FRAMES = 12;
const EAR_THRESHOLD = 0.21;

function setCameraStatus(text, active = false) {
    cameraStatus.innerText = text;
    cameraToggleBtn.classList.toggle("active", active);
}

function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
}

function computeEAR(landmarks, eye) {
    const p1 = landmarks[eye[0]];
    const p2 = landmarks[eye[1]];
    const p3 = landmarks[eye[2]];
    const p4 = landmarks[eye[3]];
    const p5 = landmarks[eye[4]];
    const p6 = landmarks[eye[5]];
    return (distance(p2, p6) + distance(p3, p5)) / (2 * distance(p1, p4));
}

function onFaceResults(results) {
    if (!isCameraOn) return;
    const faces = results.multiFaceLandmarks || [];
    if (faces.length === 0) {
        eyeClosedFrames = 0;
        setCameraStatus("No face", true);
        stopPunishment("eyes");
        return;
    }
    const landmarks = faces[0];
    const leftEye = [33, 160, 158, 133, 153, 144];
    const rightEye = [263, 387, 385, 362, 380, 373];
    const leftEAR = computeEAR(landmarks, leftEye);
    const rightEAR = computeEAR(landmarks, rightEye);
    const ear = (leftEAR + rightEAR) / 2;

    if (ear < EAR_THRESHOLD) {
        eyeClosedFrames += 1;
        setCameraStatus("Eyes closed", true);
        if (eyeClosedFrames >= EYE_CLOSED_FRAMES) {
            triggerPunishment("eyes");
        }
    } else {
        eyeClosedFrames = 0;
        setCameraStatus("Eyes open", true);
        stopPunishment("eyes");
    }
}

function onHandsResults(results) {
    if (!isCameraOn) return;
    const now = Date.now();
    if (now < waveCooldownUntil) return;
    const handsData = results.multiHandLandmarks || [];
    if (handsData.length === 0) {
        waveSamples = [];
        return;
    }
    const wrist = handsData[0][0];
    waveSamples.push({ x: wrist.x, t: now });
    const cutoff = now - 1200;
    waveSamples = waveSamples.filter(s => s.t >= cutoff);
    if (waveSamples.length < 6) return;
    const xs = waveSamples.map(s => s.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if (maxX - minX < 0.18) return;
    let changes = 0;
    for (let i = 2; i < waveSamples.length; i++) {
        const v1 = waveSamples[i - 1].x - waveSamples[i - 2].x;
        const v2 = waveSamples[i].x - waveSamples[i - 1].x;
        if (v1 === 0 || v2 === 0) continue;
        if ((v1 > 0 && v2 < 0) || (v1 < 0 && v2 > 0)) changes += 1;
    }
    if (changes >= 2) {
        waveCooldownUntil = now + 2000;
        waveSamples = [];
        setCameraStatus("Wave detected", true);
        stopPunishment();
        lastActivityAt = Date.now();
        setTimeout(() => {
            if (isCameraOn) setCameraStatus("Camera on", true);
        }, 800);
    }
}

async function initCameraOnce() {
    if (camera && faceMesh) return;
    if (isCameraInitializing) return;
    if (!window.FaceMesh || !window.Camera) {
        setCameraStatus("Camera lib missing");
        return;
    }
    isCameraInitializing = true;
    faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
    });
    faceMesh.onResults(onFaceResults);

    if (window.Hands) {
        hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        hands.setOptions({
            maxNumHands: 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6,
        });
        hands.onResults(onHandsResults);
    }

    camera = new Camera(cameraFeed, {
        onFrame: async () => {
            if (!isCameraOn) return;
            const now = Date.now();
            if (now - lastDetectAt >= DETECT_INTERVAL_MS) {
                lastDetectAt = now;
                await faceMesh.send({ image: cameraFeed });
            }
            if (hands && now - lastHandDetectAt >= HAND_DETECT_INTERVAL_MS) {
                lastHandDetectAt = now;
                await hands.send({ image: cameraFeed });
            }
        },
        width: 640,
        height: 480,
    });
    isCameraInitializing = false;
}

async function startCamera() {
    if (isCameraOn) return;
    await initCameraOnce();
    if (!camera || !faceMesh) return;
    await camera.start();
    isCameraOn = true;
    cameraFeed.style.display = "block";
    setCameraStatus("Camera on", true);
}

function stopCamera() {
    if (!isCameraOn) return;
    isCameraOn = false;
    eyeClosedFrames = 0;
    waveSamples = [];
    stopPunishment("eyes");
    if (camera) camera.stop();
    cameraFeed.style.display = "none";
    setCameraStatus("Camera off", false);
}

cameraToggleBtn.addEventListener("click", async () => {
    if (isCameraOn) {
        stopCamera();
    } else {
        try {
            await startCamera();
        } catch (err) {
            setCameraStatus("Camera blocked");
            cameraFeed.style.display = "none";
        }
    }
});

// 页面加载后自动尝试开启摄像头
setTimeout(async () => {
    try {
        await startCamera();
    } catch (err) {
        setCameraStatus("Camera blocked");
        cameraFeed.style.display = "none";
    }
}, 0);

function applyTheme(isLight) {
    document.body.classList.toggle("light-theme", isLight);
    themeToggleBtn.innerText = isLight ? "DARK" : "LIGHT";
    localStorage.setItem("theme", isLight ? "light" : "dark");
}

const savedTheme = localStorage.getItem("theme");
const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
applyTheme(savedTheme ? savedTheme === "light" : prefersLight);

themeToggleBtn.addEventListener("click", () => {
    applyTheme(!document.body.classList.contains("light-theme"));
});

pauseBtn.addEventListener("click", () => {
    isPaused = !isPaused;
    if (isPaused) {
        pauseBtn.innerText = "RESUME";
        pauseBtn.classList.add("paused");
        if (isPunishing) stopPunishment();
    } else {
        pauseBtn.innerText = "PAUSE";
        pauseBtn.classList.remove("paused");
        lastActivityAt = Date.now();
    }
});

restartBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to restart the timing？")) {
        totalWorkSeconds = 0;
        timerDisplay.innerText = "00:00";
        lastActivityAt = Date.now();
        if (isPunishing) stopPunishment();
    }
});

// --- 交互重置 ---
function resetTimer() {
    if (isPaused) return;
    if (isPunishing) stopPunishment("idle");
    lastActivityAt = Date.now();
}

document.onmousemove = resetTimer;
document.onkeydown = resetTimer;
document.onmousedown = resetTimer;

// --- 惩罚系统 ---
function triggerPunishment(reason = "idle") {
    if (isPaused) return;
    if (punishmentReasons.has(reason)) return;
    punishmentReasons.add(reason);
    if (isPunishing) return;
    isPunishing = true;
    document.documentElement.classList.add("punished-active");
    punishmentInterval = setInterval(createMiniWarning, 300);
    playAnnoyingSound();
}

function stopPunishment(reason) {
    if (reason) {
        punishmentReasons.delete(reason);
    } else {
        punishmentReasons.clear();
    }
    if (punishmentReasons.size > 0) return;
    isPunishing = false;
    clearInterval(punishmentInterval);
    document.querySelectorAll(".mini-warning").forEach(el => el.remove());
    document.documentElement.classList.remove("punished-active");
    stopAnnoyingSound();
}

function createMiniWarning() {
    const warning = document.createElement("div");
    warning.className = "mini-warning";
    warning.innerHTML = "⚠️ GET BACK TO WORK! ⚠️";
    warning.style.left = Math.random() * (window.innerWidth - 200) + "px";
    warning.style.top = Math.random() * (window.innerHeight - 50) + "px";
    warning.style.transform = `rotate(${Math.random() * 20 - 10}deg)`;
    document.body.appendChild(warning);
}

// --- 声音与聊天 ---
function formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;
}

function playAnnoyingSound() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    currentOsc = audioContext.createOscillator();
    currentOsc.type = 'sawtooth';
    currentOsc.frequency.setValueAtTime(440, audioContext.currentTime);
    currentOsc.connect(audioContext.destination);
    currentOsc.start();
}
function stopAnnoyingSound() { if (currentOsc) { currentOsc.stop(); currentOsc = null; } }

// 聊天逻辑
sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
function sendMessage() {
    const msg = userInput.value.trim();
    if (!msg) return;
    addMessage(msg, "user-msg");
    userInput.value = "";
    setTimeout(() => { addMessage(getAIResponse(msg), "ai-msg"); }, 500);
}
function addMessage(text, className) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${className}`;
    msgDiv.innerText = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
function getAIResponse(q) {
    return q.split(" ").length < 3 ? "I refuse to answer 😏" : "This is a proper AI response 👍";
}