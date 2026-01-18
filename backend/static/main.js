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
const expandBtn = document.querySelector(".expand-btn");
const crazyBtn = document.getElementById("crazy-btn");
const kpiInput = document.getElementById("kpi-input");
const setKpiBtn = document.getElementById("set-kpi-btn");
const countriesCount = document.getElementById("countries-count");
const countriesNumber = document.getElementById("countries-number");
const leaderboardCard = document.getElementById("leaderboard");

// --- 状态变量 ---
const INACTIVITY_LIMIT = 20;
let lastActivityAt = Date.now();
let totalWorkSeconds = 0; // 累计工作时长
let isPunishing = false;
let isPaused = false;
let punishmentInterval = null;
let audioContext = null;
let currentOsc = null;
const punishmentReasons = new Set();

// --- Crazy模式状态变量 ---
let isCrazyMode = false;
let crazyMouseInterval = null;
let crazyEscCount = 0;
let sendBtnOriginalPosition = null;
let nomNomAudio = null;

// --- 热气球奖励系统 ---
let kpiMinutes = 30; // 默认KPI：30分钟
let lastKpiCheckTime = 0; // 上次检查KPI的时间
let unlockedCities = new Set(); // 已解锁的城市
let isBalloonActive = false; // 防止同时出现多个热气球
let dailyCitiesCount = 0; // 今天解锁的城市数量
let lastCityUnlockDate = null; // 上次解锁城市的日期
const CITIES = [
    "🇨🇳 Beijing", "🇺🇸 New York", "🇯🇵 Tokyo", "🇬🇧 London", "🇫🇷 Paris", "🇩🇪 Berlin",
    "🇮🇹 Rome", "🇪🇸 Madrid", "🇨🇦 Toronto", "🇦🇺 Sydney", "🇧🇷 Rio de Janeiro", "🇮🇳 Mumbai",
    "🇷🇺 Moscow", "🇰🇷 Seoul", "🇲🇽 Mexico City", "🇳🇱 Amsterdam", "🇸🇪 Stockholm",
    "🇳🇴 Oslo", "🇩🇰 Copenhagen", "🇫🇮 Helsinki", "🇨🇭 Zurich", "🇦🇹 Vienna",
    "🇧🇪 Brussels", "🇵🇱 Warsaw", "🇬🇷 Athens", "🇵🇹 Lisbon", "🇹🇷 Istanbul", "🇸🇬 Singapore",
    "🇹🇭 Bangkok", "🇻🇳 Ho Chi Minh City", "🇵🇭 Manila", "🇮🇩 Jakarta", "🇲🇾 Kuala Lumpur",
    "🇳🇿 Auckland", "🇿🇦 Cape Town", "🇪🇬 Cairo", "🇦🇷 Buenos Aires", "🇨🇱 Santiago",
    "🇪🇸 Barcelona", "🇮🇹 Milan", "🇺🇸 Los Angeles", "🇺🇸 Chicago", "🇨🇦 Vancouver",
    "🇦🇺 Melbourne", "🇯🇵 Osaka", "🇨🇳 Shanghai", "🇨🇳 Hong Kong", "🇸🇬 Singapore"
];
const BALLOON_IMAGE_PATH = '/static/balloon.png'; // 热气球图片路径

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

        // 检查是否达到KPI
        checkKPI();

        // 检查是否达到空闲时间限制，触发warning
        if (idleMs >= INACTIVITY_LIMIT * 1000) {
            triggerPunishment("idle");
        }
    } else {
        statusLabel.innerText = "⚠️ IDLE!";
        timerDisplay.innerText = "!!!!";
    }
}, 1000);

// --- Ranking List 功能（提前定义，供其他函数使用）---
const leaderboardList = document.getElementById("leaderboard-list");

// 获取今天的日期字符串 (YYYY-MM-DD)
function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// 格式化日期显示 (MM-DD)
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

// 获取所有工作记录
function getWorkRecords() {
    const stored = localStorage.getItem('workRecords');
    return stored ? JSON.parse(stored) : {};
}

// 保存当天的工作时长
function saveTodayWorkTime() {
    const today = getTodayDate();
    const records = getWorkRecords();

    // 如果今天已经有记录，取较大值（保留最长工作时间）
    if (records[today]) {
        records[today] = Math.max(records[today], totalWorkSeconds);
    } else {
        records[today] = totalWorkSeconds;
    }

    localStorage.setItem('workRecords', JSON.stringify(records));
    updateLeaderboard();
}

// 更新排行榜显示
// 获取每日城市解锁记录
function getDailyCitiesRecords() {
    const stored = localStorage.getItem('dailyCitiesRecords');
    return stored ? JSON.parse(stored) : {};
}

// 保存当天解锁的城市数量
function saveDailyCitiesCount() {
    const today = getTodayDate();
    const records = getDailyCitiesRecords();
    records[today] = dailyCitiesCount;
    localStorage.setItem('dailyCitiesRecords', JSON.stringify(records));
    updateLeaderboard();
}

// 初始化每日城市计数（不重置，一直累加）
function initDailyCitiesCount() {
    const today = getTodayDate();
    // 从localStorage加载今天的计数
    const records = getDailyCitiesRecords();
    if (records[today]) {
        dailyCitiesCount = records[today];
    } else {
        dailyCitiesCount = 0;
    }
    lastCityUnlockDate = today;
}

function updateLeaderboard() {
    const records = getWorkRecords();
    const citiesRecords = getDailyCitiesRecords();
    const sortedDates = Object.keys(records).sort((a, b) => {
        // 按日期降序排列（最新的在前）
        return new Date(b) - new Date(a);
    });

    leaderboardList.innerHTML = '';

    // 添加工作时长排行榜标题
    const workTitle = document.createElement('li');
    workTitle.className = 'leaderboard-item leaderboard-title';
    workTitle.innerHTML = '<span>📊 Work Time Ranking</span><span></span>';
    leaderboardList.appendChild(workTitle);

    if (sortedDates.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'leaderboard-item';
        emptyItem.innerHTML = '<span>No record yet</span><span>start working!</span>';
        leaderboardList.appendChild(emptyItem);
    } else {
        // 显示最近30天的记录
        sortedDates.slice(0, 30).forEach((date, index) => {
            const item = document.createElement('li');
            item.className = 'leaderboard-item';
            const timeStr = formatTime(records[date]);
            const dateStr = formatDate(date);
            const isToday = date === getTodayDate();

            item.innerHTML = `
                <span>${isToday ? '📅 Today' : dateStr}</span>
                <span>${timeStr}</span>
            `;

            if (isToday) {
                item.style.background = 'rgba(255, 122, 0, 0.2)';
                item.style.border = '1px solid rgba(255, 122, 0, 0.4)';
            }

            leaderboardList.appendChild(item);
        });
    }

    // 添加分隔线
    const separator = document.createElement('li');
    separator.className = 'leaderboard-separator';
    separator.innerHTML = '<hr>';
    leaderboardList.appendChild(separator);

    // 添加城市解锁排行榜标题
    const citiesTitle = document.createElement('li');
    citiesTitle.className = 'leaderboard-item leaderboard-title';
    citiesTitle.innerHTML = '<span>🌍 Cities Unlocked Ranking</span><span></span>';
    leaderboardList.appendChild(citiesTitle);

    // 获取并排序城市解锁记录
    const sortedCitiesDates = Object.keys(citiesRecords).sort((a, b) => {
        // 按城市数量降序排列，然后按日期降序
        if (citiesRecords[b] !== citiesRecords[a]) {
            return citiesRecords[b] - citiesRecords[a];
        }
        return new Date(b) - new Date(a);
    });

    if (sortedCitiesDates.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'leaderboard-item';
        emptyItem.innerHTML = '<span>No cities unlocked yet</span><span>reach your KPI!</span>';
        leaderboardList.appendChild(emptyItem);
    } else {
        // 显示所有记录（按数量排名）
        sortedCitiesDates.slice(0, 30).forEach((date, index) => {
            const item = document.createElement('li');
            item.className = 'leaderboard-item';
            const count = citiesRecords[date];
            const dateStr = formatDate(date);
            const isToday = date === getTodayDate();
            const rank = index + 1;

            item.innerHTML = `
                <span>${isToday ? '📅 Today' : dateStr} ${rank === 1 && count > 0 ? '🥇' : ''}</span>
                <span>${count} cities</span>
            `;
            if (isToday) {
                item.style.background = 'rgba(255, 122, 0, 0.2)';
                item.style.border = '1px solid rgba(255, 122, 0, 0.4)';
            }
            leaderboardList.appendChild(item);
        });
    }
}

// --- 按钮逻辑 ---
let isDraggingTimer = false;
let isDraggingCamera = false;
let isDraggingLeaderboard = false;
let isResizingLeaderboard = false;
let isResizingApp = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let cameraDragOffsetX = 0;
let cameraDragOffsetY = 0;
let leaderboardDragOffsetX = 0;
let leaderboardDragOffsetY = 0;
let leaderboardResizeStartX = 0;
let leaderboardResizeStartY = 0;
let leaderboardResizeStartWidth = 0;
let leaderboardResizeStartHeight = 0;
let appResizeStartX = 0;
let appResizeStartY = 0;
let appResizeStartWidth = 0;
let appResizeStartHeight = 0;

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
    if (isDraggingTimer) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const nextLeft = clientX - dragOffsetX;
        const nextTop = clientY - dragOffsetY;
        setTimerPosition(nextLeft, nextTop);
    } else if (isDraggingCamera) {
        onCameraDragMove(e);
    } else if (isDraggingLeaderboard) {
        onLeaderboardDragMove(e);
    } else if (isResizingLeaderboard) {
        onLeaderboardResizeMove(e);
    } else if (isResizingApp) {
        onAppResizeMove(e);
    }
}

function onDragEnd() {
    if (isDraggingTimer) {
        isDraggingTimer = false;
        floatingTimer.classList.remove("dragging");
        const rect = floatingTimer.getBoundingClientRect();
        localStorage.setItem("timer-pos", JSON.stringify({ left: rect.left, top: rect.top }));
    } else if (isDraggingCamera) {
        onCameraDragEnd();
    } else if (isDraggingLeaderboard) {
        isDraggingLeaderboard = false;
        leaderboardCard.classList.remove("dragging");
        const rect = leaderboardCard.getBoundingClientRect();
        localStorage.setItem("leaderboard-pos", JSON.stringify({ left: rect.left, top: rect.top }));
    } else if (isResizingLeaderboard) {
        isResizingLeaderboard = false;
        leaderboardCard.classList.remove("resizing");
        const rect = leaderboardCard.getBoundingClientRect();
        localStorage.setItem("leaderboard-size", JSON.stringify({ width: rect.width, height: rect.height }));
    } else if (isResizingApp) {
        isResizingApp = false;
        appContainer.classList.remove("resizing");
        const rect = appContainer.getBoundingClientRect();
        localStorage.setItem("app-size", JSON.stringify({ width: rect.width, height: rect.height }));
    }
}

floatingTimer.addEventListener("mousedown", onDragStart);
floatingTimer.addEventListener("touchstart", onDragStart, { passive: true });
document.addEventListener("mousemove", onDragMove);
document.addEventListener("touchmove", onDragMove, { passive: true });
document.addEventListener("mouseup", onDragEnd);
document.addEventListener("touchend", onDragEnd);
window.addEventListener("resize", () => {
    if (!appContainer.classList.contains("expanded")) {
        const rect = floatingTimer.getBoundingClientRect();
        setTimerPosition(rect.left, rect.top);
        if (isCameraOn && cameraFeed.style.display !== "none") {
            const cameraRect = cameraFeed.getBoundingClientRect();
            setCameraPosition(cameraRect.left, cameraRect.top);
        }
    }
});

initTimerPosition();

// --- 摄像头拖拽功能 ---
function setCameraPosition(left, top) {
    const maxLeft = window.innerWidth - cameraFeed.offsetWidth;
    const maxTop = window.innerHeight - cameraFeed.offsetHeight;
    cameraFeed.style.left = `${clamp(left, 0, maxLeft)}px`;
    cameraFeed.style.top = `${clamp(top, 0, maxTop)}px`;
    cameraFeed.style.right = "auto";
}

function initCameraPosition() {
    const saved = localStorage.getItem("camera-pos");
    if (saved) {
        try {
            const { left, top } = JSON.parse(saved);
            if (typeof left === "number" && typeof top === "number") {
                setCameraPosition(left, top);
                return;
            }
        } catch (_) {}
    }
    // 默认位置
    setCameraPosition(window.innerWidth - 234, 84);
}

function onCameraDragStart(e) {
    if (e.target.closest("button") || e.target.closest("input")) return;
    if (!isCameraOn || cameraFeed.style.display === "none") return;
    isDraggingCamera = true;
    cameraFeed.classList.add("dragging");
    const rect = cameraFeed.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    cameraDragOffsetX = clientX - rect.left;
    cameraDragOffsetY = clientY - rect.top;
}

function onCameraDragMove(e) {
    if (!isDraggingCamera) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const nextLeft = clientX - cameraDragOffsetX;
    const nextTop = clientY - cameraDragOffsetY;
    setCameraPosition(nextLeft, nextTop);
}

function onCameraDragEnd() {
    if (!isDraggingCamera) return;
    isDraggingCamera = false;
    cameraFeed.classList.remove("dragging");
    const rect = cameraFeed.getBoundingClientRect();
    localStorage.setItem("camera-pos", JSON.stringify({ left: rect.left, top: rect.top }));
}

cameraFeed.addEventListener("mousedown", onCameraDragStart);
cameraFeed.addEventListener("touchstart", onCameraDragStart, { passive: true });
// 使用全局事件监听器（已在timer部分添加）

initCameraPosition();

// --- 排行榜拖拽和缩放功能 ---
function setLeaderboardPosition(left, top) {
    const maxLeft = window.innerWidth - leaderboardCard.offsetWidth;
    const maxTop = window.innerHeight - leaderboardCard.offsetHeight;
    leaderboardCard.style.left = `${clamp(left, 0, maxLeft)}px`;
    leaderboardCard.style.top = `${clamp(top, 80, maxTop)}px`;
    leaderboardCard.style.right = "auto";
}

function initLeaderboardPosition() {
    const saved = localStorage.getItem("leaderboard-pos");
    if (saved) {
        try {
            const { left, top } = JSON.parse(saved);
            if (typeof left === "number" && typeof top === "number") {
                setLeaderboardPosition(left, top);
                return;
            }
        } catch (_) {}
    }
    // 默认位置（右侧）
    setLeaderboardPosition(window.innerWidth - 300, 80);
}

function initLeaderboardSize() {
    const saved = localStorage.getItem("leaderboard-size");
    if (saved) {
        try {
            const { width, height } = JSON.parse(saved);
            if (typeof width === "number" && typeof height === "number") {
                leaderboardCard.style.width = `${Math.max(200, Math.min(600, width))}px`;
                leaderboardCard.style.height = `${Math.max(200, Math.min(window.innerHeight - 100, height))}px`;
                return;
            }
        } catch (_) {}
    }
}

function onLeaderboardDragStart(e) {
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".leaderboard-resize-handle")) return;
    isDraggingLeaderboard = true;
    leaderboardCard.classList.add("dragging");
    const rect = leaderboardCard.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    leaderboardDragOffsetX = clientX - rect.left;
    leaderboardDragOffsetY = clientY - rect.top;
}

function onLeaderboardDragMove(e) {
    if (!isDraggingLeaderboard) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const nextLeft = clientX - leaderboardDragOffsetX;
    const nextTop = clientY - leaderboardDragOffsetY;
    setLeaderboardPosition(nextLeft, nextTop);
}

function onLeaderboardResizeStart(e) {
    e.preventDefault();
    e.stopPropagation();
    isResizingLeaderboard = true;
    leaderboardCard.classList.add("resizing");
    const rect = leaderboardCard.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    leaderboardResizeStartX = clientX;
    leaderboardResizeStartY = clientY;
    leaderboardResizeStartWidth = rect.width;
    leaderboardResizeStartHeight = rect.height;
}

function onLeaderboardResizeMove(e) {
    if (!isResizingLeaderboard) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - leaderboardResizeStartX;
    const deltaY = clientY - leaderboardResizeStartY;
    const newWidth = Math.max(200, Math.min(600, leaderboardResizeStartWidth + deltaX));
    const newHeight = Math.max(200, Math.min(window.innerHeight - 100, leaderboardResizeStartHeight + deltaY));
    leaderboardCard.style.width = `${newWidth}px`;
    leaderboardCard.style.height = `${newHeight}px`;
}

if (leaderboardCard) {
    leaderboardCard.addEventListener("mousedown", onLeaderboardDragStart);
    leaderboardCard.addEventListener("touchstart", onLeaderboardDragStart, { passive: true });

    // 缩放手柄事件
    const resizeHandle = leaderboardCard.querySelector(".leaderboard-resize-handle");
    if (resizeHandle) {
        resizeHandle.addEventListener("mousedown", onLeaderboardResizeStart);
        resizeHandle.addEventListener("touchstart", onLeaderboardResizeStart, { passive: false });
    }

    initLeaderboardPosition();
    initLeaderboardSize();
}

// --- AI聊天框缩放功能 ---
function initAppSize() {
    const saved = localStorage.getItem("app-size");
    if (saved) {
        try {
            const { width, height } = JSON.parse(saved);
            if (typeof width === "number" && typeof height === "number") {
                // 限制最小和最大尺寸
                const minWidth = 320;
                const maxWidth = Math.min(1200, window.innerWidth - 40);
                const minHeight = 400;
                const maxHeight = Math.min(900, window.innerHeight - 100);

                const finalWidth = Math.max(minWidth, Math.min(maxWidth, width));
                const finalHeight = Math.max(minHeight, Math.min(maxHeight, height));

                appContainer.style.width = `${finalWidth}px`;
                appContainer.style.height = `${finalHeight}px`;
                return;
            }
        } catch (_) {}
    }
}

function onAppResizeStart(e) {
    // 全屏模式下不允许缩放
    if (appContainer.classList.contains("expanded")) return;

    e.preventDefault();
    e.stopPropagation();
    isResizingApp = true;
    appContainer.classList.add("resizing");
    const rect = appContainer.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    appResizeStartX = clientX;
    appResizeStartY = clientY;
    appResizeStartWidth = rect.width;
    appResizeStartHeight = rect.height;
}

function onAppResizeMove(e) {
    if (!isResizingApp) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - appResizeStartX;
    const deltaY = clientY - appResizeStartY;

    // 限制最小和最大尺寸
    const minWidth = 320;
    const maxWidth = Math.min(1200, window.innerWidth - 40);
    const minHeight = 400;
    const maxHeight = Math.min(900, window.innerHeight - 100);

    const newWidth = Math.max(minWidth, Math.min(maxWidth, appResizeStartWidth + deltaX));
    const newHeight = Math.max(minHeight, Math.min(maxHeight, appResizeStartHeight + deltaY));

    appContainer.style.width = `${newWidth}px`;
    appContainer.style.height = `${newHeight}px`;
}

// 初始化AI聊天框缩放功能
const appResizeHandle = appContainer?.querySelector(".app-resize-handle");
if (appResizeHandle) {
    appResizeHandle.addEventListener("mousedown", onAppResizeStart);
    appResizeHandle.addEventListener("touchstart", onAppResizeStart, { passive: false });
    initAppSize();
}

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
const EYE_CLOSED_FRAMES = 12; // 约3秒（12帧 * 30fps ≈ 0.4秒，实际约3秒）
const EAR_THRESHOLD = 0.21;
let hasTakenShamePhoto = false; // 标记是否已经拍过照（避免重复拍照）

// 嘴巴检测相关变量
let mouthOpenFrames = 0;
const MOUTH_OPEN_FRAMES = 5; // 连续5帧检测到嘴巴张开才触发
const MAR_THRESHOLD = 0.5; // 嘴巴纵横比阈值，大于此值表示嘴巴张开

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

// 计算嘴巴纵横比 (Mouth Aspect Ratio)
// 使用嘴巴的关键点：上唇中心(13), 下唇中心(14), 左嘴角(61), 右嘴角(291)
function computeMAR(landmarks) {
    // 上唇中心点
    const topLip = landmarks[13];
    // 下唇中心点
    const bottomLip = landmarks[14];
    // 左嘴角
    const leftCorner = landmarks[61];
    // 右嘴角
    const rightCorner = landmarks[291];

    // 计算嘴巴高度（上下唇距离）
    const mouthHeight = distance(topLip, bottomLip);
    // 计算嘴巴宽度（左右嘴角距离）
    const mouthWidth = distance(leftCorner, rightCorner);

    // 避免除零
    if (mouthWidth === 0) return 0;

    // 返回嘴巴纵横比（高度/宽度）
    return mouthHeight / mouthWidth;
}

function onFaceResults(results) {
    if (!isCameraOn) return;
    const faces = results.multiFaceLandmarks || [];
    if (faces.length === 0) {
        eyeClosedFrames = 0;
        mouthOpenFrames = 0;
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

    // 检查是否在冷却期内（嘴巴张开取消警告后的冷却期）
    // const now = Date.now();
    // const inCooldown = now < mouthOpenCooldownUntil;

    // 眼睛检测（冷却期内不触发新的惩罚）
    if (ear < EAR_THRESHOLD) {
        eyeClosedFrames += 1;
        setCameraStatus("Eyes closed", true);
        if (eyeClosedFrames >= EYE_CLOSED_FRAMES && !inCooldown) {
            triggerPunishment("eyes");
            // 触发羞耻快照（只在第一次触发时拍照，且摄像头已开启）
            if (!hasTakenShamePhoto && isCameraOn && cameraFeed && cameraFeed.readyState === 4) {
                takeShamePhoto();
                hasTakenShamePhoto = true;
            }
        }
    } else {
        eyeClosedFrames = 0;
        hasTakenShamePhoto = false; // 眼睛睁开后重置标记，允许下次再拍
        setCameraStatus("Eyes open", true);
        stopPunishment("eyes");
    }

    // 嘴巴检测 - 检测嘴巴是否张开
    const mar = computeMAR(landmarks);
    if (mar > MAR_THRESHOLD) {
        mouthOpenFrames += 1;
        if (mouthOpenFrames >= MOUTH_OPEN_FRAMES) {
            // 检测到嘴巴张开，取消所有警告并设置冷却期
            if (isPunishing) {
                stopPunishment(); // 不传参数，清除所有惩罚
                lastActivityAt = Date.now(); // 更新活动时间，防止立即重新触发
                setCameraStatus("Mouth open - Warning cleared", false);
            }
        }
    } else {
        mouthOpenFrames = 0;
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
    mouthOpenFrames = 0;
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

// --- 全屏切换功能 ---
expandBtn.addEventListener("click", () => {
    const isExpanding = !appContainer.classList.contains("expanded");
    appContainer.classList.toggle("expanded");
    expandBtn.classList.toggle("expanded");

    // 切换图标：⛶ (全屏) 和 ✕ (退出全屏)
    if (appContainer.classList.contains("expanded")) {
        expandBtn.innerHTML = "✕"; // 退出全屏图标
        expandBtn.setAttribute("aria-label", "Exit fullscreen");
        // 全屏时隐藏摄像头和timer
        floatingTimer.style.display = "none";
        if (cameraFeed) {
            cameraFeed.style.display = "none";
        }
    } else {
        expandBtn.innerHTML = "⛶"; // 全屏图标
        expandBtn.setAttribute("aria-label", "Expand chat");
        // 退出全屏时恢复显示
        floatingTimer.style.display = "";
        if (cameraFeed && isCameraOn) {
            cameraFeed.style.display = "block";
        }
    }
});

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
        // 在重置前保存当前的工作时长
        if (totalWorkSeconds > 0) {
            saveTodayWorkTime();
        }
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

    // 处理羞耻照片：只保留第一张并放大
    const allPhotos = document.querySelectorAll('.shame-photo');
    if (allPhotos.length > 0) {
        // 保留第一张照片
        const firstPhoto = allPhotos[0];

        // 移除其他所有照片
        for (let i = 1; i < allPhotos.length; i++) {
            allPhotos[i].remove();
            shamePhotoCount--;
        }

        // 将第一张照片放大并居中（如果还没有被放大）
        if (!firstPhoto.classList.contains('shame-photo-enlarged')) {
            firstPhoto.classList.add('shame-photo-enlarged');
            firstPhoto.style.left = '50%';
            firstPhoto.style.top = '50%';
            firstPhoto.style.zIndex = '10003';
        }
    }
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
    // 重置羞耻快照标记（当所有惩罚都停止时）
    if (punishmentReasons.size === 0) {
        hasTakenShamePhoto = false;
    }
}

// --- 羞耻快照功能 ---
let shamePhotoCount = 0; // 当前显示的照片数量
const MAX_SHAME_PHOTOS = 5; // 最多同时显示5张照片，避免内存占用过多

function takeShamePhoto() {
    if (!cameraFeed || cameraFeed.readyState !== 4) return;

    // 限制同时显示的照片数量
    const existingPhotos = document.querySelectorAll('.shame-photo');
    if (existingPhotos.length >= MAX_SHAME_PHOTOS) {
        // 移除最旧的照片
        existingPhotos[0].remove();
    }

    try {
        // 创建canvas元素
        const canvas = document.createElement('canvas');
        canvas.width = cameraFeed.videoWidth || 640;
        canvas.height = cameraFeed.videoHeight || 480;
        const ctx = canvas.getContext('2d');

        // 绘制视频帧到canvas
        ctx.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

        // 添加水印文字
        const now = new Date();
        const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('zh-CN');

        // 计算文字大小（响应式）
        const fontSize1 = Math.max(32, canvas.width / 15);
        const fontSize2 = Math.max(24, canvas.width / 20);
        const fontSize3 = Math.max(28, canvas.width / 18);

        // 添加主要水印文字
        const mainText = '😴 I WAS SLEEPING';
        const timeText = `@ ${timeStr} ${dateStr}`;
        const subText = 'START WORKING NOW!!!';

        // 绘制文字（带描边效果）
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // 先绘制半透明背景框
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        const textWidth = Math.max(canvas.width * 0.6, 300);
        const textHeight = 140;
        ctx.fillRect(centerX - textWidth / 2, centerY - textHeight / 2, textWidth, textHeight);

        // 设置文字样式
        ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
        ctx.lineWidth = Math.max(2, canvas.width / 200);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 主文字
        ctx.font = `bold ${fontSize1}px Arial`;
        ctx.fillStyle = 'rgba(255, 0, 0, 1)';
        ctx.strokeText(mainText, centerX, centerY - 50);
        ctx.fillText(mainText, centerX, centerY - 50);

        // 时间文字
        ctx.font = `bold ${fontSize2}px Arial`;
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.strokeText(timeText, centerX, centerY);
        ctx.fillText(timeText, centerX, centerY);

        // 中文文字
        ctx.font = `bold ${fontSize1}px Arial`;
        ctx.fillStyle = 'rgba(255, 0, 0, 1)';
        ctx.strokeText(subText, centerX, centerY + 50);
        ctx.fillText(subText, centerX, centerY + 50);

        // 将canvas转换为图片URL（不下载，只用于显示）
        const imageUrl = canvas.toDataURL('image/png');

        // 创建照片弹窗
        const photoDiv = document.createElement('div');
        photoDiv.className = 'shame-photo';

        // 随机位置
        const randomX = Math.random() * (window.innerWidth - 300);
        const randomY = Math.random() * (window.innerHeight - 400);
        const randomRotate = (Math.random() * 20 - 10); // -10到10度

        photoDiv.style.left = randomX + 'px';
        photoDiv.style.top = randomY + 'px';
        photoDiv.style.transform = `rotate(${randomRotate}deg)`;

        // 创建关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.className = 'shame-photo-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => {
            photoDiv.remove();
            shamePhotoCount--;
        };

        // 创建图片元素
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Shame Photo';

        // 组装元素
        photoDiv.appendChild(closeBtn);
        photoDiv.appendChild(img);
        document.body.appendChild(photoDiv);

        shamePhotoCount++;

        // 显示提示
        setCameraStatus("📸 Shame photo captured!", true);
        setTimeout(() => {
            if (isCameraOn) {
                setCameraStatus("Eyes closed", true);
            }
        }, 2000);

    } catch (error) {
        console.error('Error taking shame photo:', error);
    }
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

// --- 聊天逻辑 ---
sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

async function sendMessage() {
    const msg = userInput.value.trim();
    if (!msg) return;

    addMessage(msg, "user-msg");
    userInput.value = "";

    addMessage("🤖 AI is thinking...", "ai-msg");
    try {
        const res = await fetch("/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: msg })  // Make sure it matches app.py key
        });

        const data = await res.json();

        const lastAI = messagesContainer.querySelector(".ai-msg:last-child");
        if (lastAI && lastAI.innerText === "🤖 AI is thinking...") lastAI.remove();

        // Crazy模式：始终回复固定消息
        if (isCrazyMode) {
            addMessage("I don't know, you need click 'Sent' to acquire answers", "ai-msg");
            return;
        }

        if (data.status === "ok") {
            // Good question → show AI answer
            addMessage(data.answer, "ai-msg");
        } else if (data.status === "bad_question") {
            // Bad question → show guidance
            const guidance = data.guidance;
            let guidanceText = `⚠️ Your question is unclear: ${guidance.reason}\nTips:\n`;
            guidance.tips.forEach((tip, i) => {
                guidanceText += `${i + 1}. ${tip}\n`;
            });

            if (guidance.command) {
                guidanceText += `Suggested command: ${guidance.command} (click to insert)`;
            }

            addMessage(guidanceText, "ai-msg");

            // Make suggested command clickable
            if (guidance.command) {
                const lastMsg = messagesContainer.querySelector(".ai-msg:last-child");
                lastMsg.style.cursor = "pointer";
                lastMsg.style.color = "blue";
                lastMsg.addEventListener("click", () => {
                    userInput.value = guidance.command + " ";
                    userInput.focus();
                });
            }
        }
    } catch (err) {
        const lastAI = messagesContainer.querySelector(".ai-msg:last-child");
        if (lastAI && lastAI.innerText === "🤖 AI is thinking...") lastAI.remove();

        // Fallback local response
        addMessage(getAIResponse(msg), "ai-msg");
    }
}
function addMessage(text, className) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${className}`;
    msgDiv.innerText = text;
    messagesContainer.appendChild(msgDiv);
    // 确保滚动到底部，使用requestAnimationFrame确保DOM已更新
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}
function getAIResponse(q) {
    return q.split(" ").length < 3 ? "I refuse to answer 😏" : "This is a proper AI response 👍";
}

// 每分钟保存一次当前工作时长
setInterval(() => {
    if (!isPaused && !isPunishing && totalWorkSeconds > 0) {
        saveTodayWorkTime();
    }
}, 60000); // 每60秒保存一次

// 页面加载时显示排行榜
updateLeaderboard();

// 页面关闭或刷新前保存
window.addEventListener('beforeunload', () => {
    if (totalWorkSeconds > 0) {
        saveTodayWorkTime();
    }
});

// --- Crazy模式功能 ---
function startCrazyMode() {
    isCrazyMode = true;
    document.body.classList.add("crazy-mode");
    crazyBtn.classList.add("active");
    crazyEscCount = 0;

    // 保存Send按钮原始位置
    const rect = sendBtn.getBoundingClientRect();
    sendBtnOriginalPosition = { x: rect.left, y: rect.top };
    sendBtn.style.position = "relative";
    sendBtn.style.transition = "transform 0.3s ease";
    sendBtn.style.zIndex = "1000"; // 确保按钮始终在最上层，不会被遮挡

    // 1. 鼠标视觉抖动效果（浏览器安全限制无法真正移动鼠标）- 增强版
    let cursorOffset = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;

    // 监听鼠标移动，添加随机偏移（进一步减少抖动）
    const mouseMoveHandler = (e) => {
        if (!isCrazyMode) return;

        // 进一步减少抖动幅度，从8px减少到3px
        const randomOffsetX = (Math.random() - 0.5) * 3;
        const randomOffsetY = (Math.random() - 0.5) * 3;

        // 让页面元素看起来在非常轻微的抖动（模拟鼠标不听指挥）
        document.body.style.transform = `translate(${randomOffsetX * 0.2}px, ${randomOffsetY * 0.2}px)`;

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    };

    document.addEventListener("mousemove", mouseMoveHandler);

    // 光标抖动动画（增强抖动）
    crazyMouseInterval = setInterval(() => {
        if (!isCrazyMode) return;

        cursorOffset = (cursorOffset + 12) % 360; // 增加旋转速度
        const offsetX = Math.sin(cursorOffset * Math.PI / 180) * 12; // 增加抖动幅度
        const offsetY = Math.cos(cursorOffset * Math.PI / 180) * 12; // 增加抖动幅度

        // 增加随机抖动
        const randomX = (Math.random() - 0.5) * 8; // 增加随机抖动
        const randomY = (Math.random() - 0.5) * 8; // 增加随机抖动

        document.body.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="red" opacity="0.9"/><circle cx="14" cy="14" r="6" fill="white"/></svg>') ${14 + offsetX + randomX} ${14 + offsetY + randomY}, auto`;
    }, 40); // 降低更新间隔，让抖动更频繁

    // 保存mouseMoveHandler以便清理
    window._crazyMouseMoveHandler = mouseMoveHandler;

    // 1.5. 让鼠标更难控制：让按钮在鼠标靠近时轻微移动
    const addButtonInterference = () => {
        if (!isCrazyMode) return;

        const allButtons = document.querySelectorAll('button:not(#crazy-btn)');
        allButtons.forEach(btn => {
            const mouseEnterHandler = (e) => {
                if (!isCrazyMode) return;
                // 随机移动按钮位置（5-10px）
                const offsetX = (Math.random() - 0.5) * 20;
                const offsetY = (Math.random() - 0.5) * 20;
                btn.style.transition = 'transform 0.2s ease';
                btn.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            };

            const mouseLeaveHandler = () => {
                if (!isCrazyMode) return;
                setTimeout(() => {
                    btn.style.transform = '';
                }, 200);
            };

            btn.addEventListener('mouseenter', mouseEnterHandler);
            btn.addEventListener('mouseleave', mouseLeaveHandler);
        });
    };

    // 延迟启用按钮干扰，避免影响crazy按钮本身
    setTimeout(() => {
        if (isCrazyMode) {
            addButtonInterference();
        }
    }, 500);

    // 定期更新按钮干扰
    const buttonInterferenceInterval = setInterval(() => {
        if (isCrazyMode) {
            addButtonInterference();
        } else {
            clearInterval(buttonInterferenceInterval);
        }
    }, 3000);

    window._buttonInterferenceInterval = buttonInterferenceInterval;

    // 2. 输入文字消失效果
    let lastInputLength = 0;
    const inputHandler = () => {
        if (!isCrazyMode) {
            userInput.removeEventListener("input", inputHandler);
            return;
        }

        const currentLength = userInput.value.length;
        if (currentLength > lastInputLength) {
            // 用户正在输入，延迟后删除最后一个字符
            setTimeout(() => {
                if (isCrazyMode && userInput.value.length > 0) {
                    userInput.value = userInput.value.slice(0, -1);
                }
            }, 300);
        }
        lastInputLength = userInput.value.length;
    };
    userInput.addEventListener("input", inputHandler);

    // 3. 咀嚼声音效果
    playNomNomSound();

    // 4. Send按钮逃走功能
    sendBtn.addEventListener("mousemove", onSendBtnMouseMove);
    sendBtn.addEventListener("mouseenter", onSendBtnMouseEnter);
}

function stopCrazyMode() {
    isCrazyMode = false;
    document.body.classList.remove("crazy-mode");
    crazyBtn.classList.remove("active");

    // 停止鼠标移动
    if (crazyMouseInterval) {
        clearInterval(crazyMouseInterval);
        crazyMouseInterval = null;
    }

    // 停止按钮干扰
    if (window._buttonInterferenceInterval) {
        clearInterval(window._buttonInterferenceInterval);
        window._buttonInterferenceInterval = null;
    }

    // 移除鼠标移动监听
    if (window._crazyMouseMoveHandler) {
        document.removeEventListener("mousemove", window._crazyMouseMoveHandler);
        window._crazyMouseMoveHandler = null;
    }

    // 恢复页面transform
    document.body.style.transform = "";

    // 恢复所有按钮的transform
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(btn => {
        if (btn.style.transform) {
            btn.style.transform = '';
        }
    });

    // 恢复Send按钮位置
    if (sendBtnOriginalPosition) {
        sendBtn.style.position = "";
        sendBtn.style.left = "";
        sendBtn.style.top = "";
        sendBtn.style.transform = "";
        sendBtn.style.transition = "";
    }

    // 移除Send按钮事件监听
    sendBtn.removeEventListener("mousemove", onSendBtnMouseMove);
    sendBtn.removeEventListener("mouseenter", onSendBtnMouseEnter);

    // 恢复光标
    document.body.style.cursor = "";

    // 停止声音
    if (nomNomAudio) {
        nomNomAudio.pause();
        nomNomAudio = null;
    }
}

function onSendBtnMouseMove(e) {
    if (!isCrazyMode) return;

    const btnRect = sendBtn.getBoundingClientRect();
    const btnCenterX = btnRect.left + btnRect.width / 2;
    const btnCenterY = btnRect.top + btnRect.height / 2;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const distance = Math.sqrt(
        Math.pow(mouseX - btnCenterX, 2) + Math.pow(mouseY - btnCenterY, 2)
    );

    // 如果鼠标靠近按钮（距离小于80px），让按钮逃走
    if (distance < 80) {
        // 获取整个chatbox (#app) 的边界
        const appRect = appContainer.getBoundingClientRect();

        // 获取input-container的边界（按钮的原始容器）
        const inputContainer = document.getElementById("input-container");
        const containerRect = inputContainer.getBoundingClientRect();

        // 获取按钮的原始位置（相对于input-container）
        const btnOriginalLeft = btnRect.left - containerRect.left;
        const btnOriginalTop = btnRect.top - containerRect.top;

        // 限制移动范围：不超过input-container的边界，但可以在整个chatbox内移动
        // 计算相对于input-container的最大移动距离
        const maxMoveX = containerRect.width - btnRect.width - btnOriginalLeft;
        const minMoveX = -btnOriginalTop;

        // 但也要考虑整个chatbox的边界
        const appMaxX = appRect.width - btnRect.width - (btnRect.left - appRect.left);
        const appMinX = -(btnRect.left - appRect.left);
        const appMaxY = appRect.height - btnRect.height - (btnRect.top - appRect.top);
        const appMinY = -(btnRect.top - appRect.top);

        // 取两者的交集，确保按钮不会超出chatbox，也不会离input-container太远
        const finalMaxX = Math.min(maxMoveX, appMaxX);
        const finalMinX = Math.max(minMoveX, appMinX);
        const finalMaxY = Math.min(containerRect.height - btnRect.height - btnOriginalTop, appMaxY);
        const finalMinY = Math.max(-btnOriginalTop, appMinY);

        // 限制移动距离不要太大（最多150px），确保按钮始终可见
        const maxMoveDistance = 300;
        const escapeX = Math.max(finalMinX, Math.min(finalMaxX, (Math.random() - 0.5) * maxMoveDistance * 2));
        const escapeY = Math.max(finalMinY, Math.min(finalMaxY, (Math.random() - 0.5) * maxMoveDistance * 2));

        sendBtn.style.transform = `translate(${escapeX}px, ${escapeY}px)`;
    }
}

function onSendBtnMouseEnter(e) {
    if (!isCrazyMode) return;
    onSendBtnMouseMove(e);
}

function playNomNomSound() {
    if (!isCrazyMode) return;

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // 创建咀嚼声音效果（Nom Nom Nom）
    const playNom = () => {
        if (!isCrazyMode) return;

        const osc = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // 创建"Nom"的声音（低频到高频的快速变化）
        osc.frequency.setValueAtTime(120, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(250, audioContext.currentTime + 0.08);
        osc.frequency.exponentialRampToValueAtTime(120, audioContext.currentTime + 0.16);

        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.16);

        osc.type = 'sawtooth';
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.16);
    };

    // 播放三次"Nom"
    playNom();
    setTimeout(() => { if (isCrazyMode) playNom(); }, 200);
    setTimeout(() => { if (isCrazyMode) playNom(); }, 400);

    // 每2.5秒重复一次
    if (isCrazyMode) {
        setTimeout(playNomNomSound, 2500);
    }
}

// ESC键退出Crazy模式（需要按5次）
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isCrazyMode) {
        e.preventDefault();
        crazyEscCount++;

        if (crazyEscCount >= 5) {
            stopCrazyMode();
            crazyEscCount = 0;
            alert("Crazy mode disabled!");
        }
    } else if (e.key !== "Escape") {
        // 如果按了其他键，重置ESC计数
        crazyEscCount = 0;
    }
});

// Crazy按钮点击事件（只能进入，不能退出）
crazyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isCrazyMode) {
        startCrazyMode();
    }
    // 进入crazy模式后，点击👹不再有效（只能通过ESC退出）
});

// --- 热气球奖励系统功能 ---
function checkKPI() {
    if (isPaused || isPunishing || isBalloonActive) return; // 如果热气球正在显示，不触发新的

    const kpiSeconds = kpiMinutes * 60; //在这可以把时间调短点

    // 检查是否达到KPI（每达到一次KPI就触发一次，避免重复触发）
    // 使用Math.floor确保只在整数分钟时触发一次
    const currentMinutes = Math.floor(totalWorkSeconds / 60);
    const lastKpiMinutes = Math.floor(lastKpiCheckTime / 60);

    if (currentMinutes >= kpiMinutes && currentMinutes > lastKpiMinutes) {
        lastKpiCheckTime = totalWorkSeconds;
        launchBalloon();
    }
}

// 拍摄用户照片（用于热气球，不带水印）
function takeUserPhotoForBalloon() {
    if (!cameraFeed || !isCameraOn || cameraFeed.readyState !== 4) {
        return null; // 如果摄像头未开启，返回null
    }

    try {
        // 创建canvas元素
        const canvas = document.createElement('canvas');
        canvas.width = cameraFeed.videoWidth || 640;
        canvas.height = cameraFeed.videoHeight || 480;
        const ctx = canvas.getContext('2d');

        // 绘制视频帧到canvas（不添加水印）
        ctx.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

        // 将canvas转换为图片URL
        return canvas.toDataURL('image/png');
    } catch (error) {
        console.error('Failed to take user photo:', error);
        return null;
    }
}

function launchBalloon() {
    if (isBalloonActive) return; // 防止重复触发
    isBalloonActive = true;

    // 随机选择一个城市
    const availableCities = CITIES.filter(city => !unlockedCities.has(city));
    let randomCity;

    if (availableCities.length === 0) {
        // 所有城市都已解锁，重新开始
        unlockedCities.clear();
        localStorage.removeItem('unlockedCities');
        randomCity = CITIES[Math.floor(Math.random() * CITIES.length)];
    } else {
        randomCity = availableCities[Math.floor(Math.random() * availableCities.length)];
    }

    // 解锁城市（只解锁一个）
    unlockedCities.add(randomCity);
    saveUnlockedCities();
    updateCitiesCount();

    // 更新每日城市计数（一直累加，不重置）
    const today = getTodayDate();
    if (lastCityUnlockDate !== today) {
        // 新的一天，从localStorage加载今天的计数
        const records = getDailyCitiesRecords();
        if (records[today]) {
            dailyCitiesCount = records[today];
        } else {
            dailyCitiesCount = 0;
        }
        lastCityUnlockDate = today;
    }
    dailyCitiesCount++;
    saveDailyCitiesCount();

    // 拍摄用户照片
    const userPhotoUrl = takeUserPhotoForBalloon();

    // 创建热气球元素（使用图片）
    const balloon = document.createElement('div');
    balloon.className = 'hot-air-balloon';
    balloon.style.position = 'relative'; // 用于定位用户照片

    // 创建图片元素（更大尺寸）
    const balloonImg = document.createElement('img');
    balloonImg.src = BALLOON_IMAGE_PATH;
    balloonImg.alt = 'Hot Air Balloon';
    balloonImg.style.width = '400px';
    balloonImg.style.height = 'auto';
    balloonImg.style.display = 'block';

    balloon.appendChild(balloonImg);

    // 如果有用户照片，将照片叠加在热气球上
    if (userPhotoUrl) {
        const userPhotoImg = document.createElement('img');
        userPhotoImg.src = userPhotoUrl;
        userPhotoImg.className = 'balloon-user-photo';
        userPhotoImg.style.position = 'absolute';
        userPhotoImg.style.width = '100px'; // 照片大小（相对于400px热气球）
        userPhotoImg.style.height = '100px';
        userPhotoImg.style.objectFit = 'cover';
        userPhotoImg.style.borderRadius = '50%'; // 圆形照片
        userPhotoImg.style.border = '4px solid rgba(255, 255, 255, 0.9)';
        userPhotoImg.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.3)';
        // 将照片放在热气球篮子位置（热气球下方中间，篮子区域）
        // 热气球高度大约是宽度的1.2-1.5倍，篮子大约在底部15-20%的位置
        userPhotoImg.style.bottom = '15%'; // 距离底部15%（篮子位置）
        userPhotoImg.style.left = '50%';
        userPhotoImg.style.transform = 'translateX(-50%)';
        userPhotoImg.style.zIndex = '10';
        userPhotoImg.style.pointerEvents = 'none';
        balloon.appendChild(userPhotoImg);
    }

    balloon.setAttribute('data-city', randomCity);

    // 设置初始位置（屏幕左侧上方）
    balloon.style.position = 'fixed';
    balloon.style.left = '-250px';
    balloon.style.top = '10%';
    balloon.style.zIndex = '9999';
    balloon.style.pointerEvents = 'none';
    balloon.style.transition = 'none';
    balloon.style.opacity = '1';

    document.body.appendChild(balloon);

    // 触发动画：从左往右移动并降落
    requestAnimationFrame(() => {
        balloon.style.transition = 'left 8s linear, top 8s ease-in, opacity 2s ease-out 6s';
        balloon.style.left = 'calc(100% + 250px)';
        balloon.style.top = '70%';
        // 降落后逐渐淡出
        balloon.style.opacity = '0';
    });

    // 动画结束后显示城市信息并移除热气球
    setTimeout(() => {
        showCityUnlocked(randomCity);
        balloon.remove();
        isBalloonActive = false; // 允许下次触发
    }, 10000); // 增加到10秒，给淡出动画留时间
}

function showCityUnlocked(city) {
    // 创建解锁提示
    const notification = document.createElement('div');
    notification.className = 'city-unlocked-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">🎈</div>
            <div class="notification-text">
                <div class="notification-title">City Unlocked!</div>
                <div class="notification-city">${city}</div>
                <div class="notification-hint">Upload your photo to see where you landed!</div>
            </div>
        </div>
    `;

    document.body.appendChild(notification);

    // 显示动画
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    });

    // 3秒后自动消失
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

function saveUnlockedCities() {
    localStorage.setItem('unlockedCities', JSON.stringify(Array.from(unlockedCities)));
}

function loadUnlockedCities() {
    const saved = localStorage.getItem('unlockedCities');
    if (saved) {
        try {
            const cities = JSON.parse(saved);
            unlockedCities = new Set(cities);
            updateCitiesCount();
        } catch (e) {
            console.error('Failed to load unlocked cities:', e);
        }
    }
}

function updateCitiesCount() {
    if (countriesNumber) {
        countriesNumber.textContent = unlockedCities.size;
    }
}

// KPI设置按钮事件
if (setKpiBtn && kpiInput) {
    setKpiBtn.addEventListener("click", () => {
        const minutes = parseInt(kpiInput.value);
        if (minutes && minutes > 0) {
            kpiMinutes = minutes;
            lastKpiCheckTime = totalWorkSeconds; // 重置检查时间
            localStorage.setItem('kpiMinutes', kpiMinutes.toString());
            alert(`KPI set to ${minutes} minutes!`);
        } else {
            alert('Please enter a valid number of minutes');
        }
    });
}

// 加载保存的KPI
const savedKpi = localStorage.getItem('kpiMinutes');
if (savedKpi) {
    kpiMinutes = parseInt(savedKpi);
    if (kpiInput) {
        kpiInput.value = kpiMinutes;
    }
}

// 加载已解锁的城市
loadUnlockedCities();

// 初始化每日城市计数
initDailyCitiesCount();