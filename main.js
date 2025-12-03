const { app, Tray, nativeImage, Menu, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const GIF = require('gifuct-js');
const GIFEncoder = require('gif-encoder-2');
const { createCanvas, loadImage } = require('canvas');

let tray = null;
let frames = [];
let animationInterval = null;
let isAnimating = false;
let currentSize = 32;
let settingsWindow = null;
let performanceMode = 'balanced'; 

const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');
const iconStoragePath = path.join(userDataPath, 'tray-icon.processed');
const assetsPath = path.join(__dirname, 'assets');

const PERFORMANCE_PROFILES = {
    light: {
        maxFrames: 15,
        minFrameDelay: 80,
        imageQuality: 'good',
        compressionLevel: 9,
        displayName: ' Light ',
        description: '~100-150MB RAM'
    },
    balanced: {
        maxFrames: 30,
        minFrameDelay: 50,
        imageQuality: 'good',
        compressionLevel: 6,
        displayName: ' Balanced',
        description: '~150-250MB RAM'
    },
    performance: {
        maxFrames: 60,
        minFrameDelay: 30,
        imageQuality: 'best',
        compressionLevel: 3,
        displayName: 'Performance',
        description: '~300-500MB RAM'
    }
};

function getPerformanceConfig() {
    return PERFORMANCE_PROFILES[performanceMode] || PERFORMANCE_PROFILES.balanced;
}

function getAppIcon() {
    const iconPath = path.join(assetsPath, 'icon.ico');
    if (fs.existsSync(iconPath)) return iconPath;
    return null; 
}

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            currentSize = data.size || 32;
            performanceMode = data.performanceMode || 'balanced';
        }
    } catch (error) {}
}

function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify({ 
            size: currentSize,
            performanceMode: performanceMode
        }));
    } catch (error) {}
}

function getFileType(buffer) {
    if (buffer.length < 4) return 'unknown';
    const header = buffer.toString('hex', 0, 4);
    if (header === '47494638') return 'gif';
    if (header.startsWith('ffd8')) return 'jpg';
    if (header === '89504e47') return 'png';
    return 'unknown';
}

function clearFrames() {
    if (frames.length > 0) {
        frames = [];
    }
    if (global.gc) {
        global.gc();
    }
}

async function loadTrayIcon(size = currentSize) {
    let filePath = iconStoragePath;
    if (!fs.existsSync(filePath)) return false; 

    const config = getPerformanceConfig();

    try {
        const buffer = fs.readFileSync(filePath);
        const type = getFileType(buffer);
        
        clearFrames();

        if (type === 'gif') {
            const gif = GIF.parseGIF(buffer);
            const gifFrames = GIF.decompressFrames(gif, true);
            if (!gifFrames || gifFrames.length === 0) return false;

            const frameCount = Math.min(gifFrames.length, config.maxFrames);
            const frameStep = Math.ceil(gifFrames.length / config.maxFrames);

            const { width, height } = gifFrames[0].dims;
            
            const tempCanvas = createCanvas(width, height);
            const tempCtx = tempCanvas.getContext('2d');
            const accumulatedCanvas = createCanvas(width, height);
            const accumulatedCtx = accumulatedCanvas.getContext('2d');

            for (let i = 0; i < gifFrames.length; i += frameStep) {
                if (frames.length >= config.maxFrames) break;
                
                const frame = gifFrames[i];
                
                if (i > 0) {
                    const prevIndex = Math.max(0, i - frameStep);
                    const prev = gifFrames[prevIndex];
                    if (prev.disposalType === 2) { 
                        accumulatedCtx.clearRect(0, 0, width, height);
                    }
                }
                
                const imageData = tempCtx.createImageData(frame.dims.width, frame.dims.height);
                imageData.data.set(new Uint8ClampedArray(frame.patch));
                tempCtx.clearRect(0, 0, width, height);
                tempCtx.putImageData(imageData, 0, 0);
                
                accumulatedCtx.drawImage(
                    tempCanvas, 
                    0, 0, frame.dims.width, frame.dims.height, 
                    frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height
                );
                
                const resizedBuffer = accumulatedCanvas.toBuffer('image/png', {
                    compressionLevel: config.compressionLevel,
                    filters: tempCanvas.PNG_FILTER_NONE
                });
                
                const img = nativeImage.createFromBuffer(resizedBuffer);
                if (!img.isEmpty()) {
                    frames.push({
                        image: img.resize({ width: size, height: size, quality: config.imageQuality }),
                        delay: Math.max(frame.delay || 100, config.minFrameDelay)
                    });
                }
            }
            
            tempCanvas.width = 0;
            tempCanvas.height = 0;
            accumulatedCanvas.width = 0;
            accumulatedCanvas.height = 0;
            
        } else {
            const img = nativeImage.createFromBuffer(buffer);
            if (!img.isEmpty()) {
                frames.push({
                    image: img.resize({ width: size, height: size, quality: config.imageQuality }),
                    delay: 1000
                });
            }
        }
        
        return frames.length > 0;
    } catch (error) {
        console.error("Errror icon:", error);
        return false;
    }
}

let currentFrame = 0;
function startAnimation() {
    if (frames.length === 0 || !tray || isAnimating) return;
    if (frames.length === 1) {
        tray.setImage(frames[0].image);
        return;
    }
    isAnimating = true;
    currentFrame = 0;
    
    function nextFrame() {
        if (!tray || !isAnimating || frames.length === 0) return;
        try {
            tray.setImage(frames[currentFrame].image);
            const delay = frames[currentFrame].delay;
            currentFrame = (currentFrame + 1) % frames.length;
            animationInterval = setTimeout(nextFrame, delay);
        } catch (e) { 
            isAnimating = false; 
        }
    }
    nextFrame();
}

function stopAnimation() {
    isAnimating = false;
    if (animationInterval) { 
        clearTimeout(animationInterval); 
        animationInterval = null; 
    }
}

async function processAndSaveImage(sourcePath, cropData) {
    const config = getPerformanceConfig();
    
    try {
        const buffer = fs.readFileSync(sourcePath);
        const type = getFileType(buffer);
        const cropX = Math.round(cropData.x);
        const cropY = Math.round(cropData.y);
        const cropW = Math.round(cropData.width);
        const cropH = Math.round(cropData.height);

        if (type === 'gif') {
            const gif = GIF.parseGIF(buffer);
            const gifFrames = GIF.decompressFrames(gif, true);
            
            const frameCount = Math.min(gifFrames.length, config.maxFrames);
            const frameStep = Math.ceil(gifFrames.length / config.maxFrames);
            
            const encoder = new GIFEncoder(cropW, cropH);
            encoder.setRepeat(0);
            encoder.setQuality(10);
            encoder.start();

            const { width: fullW, height: fullH } = gifFrames[0].dims;
            const fullCanvas = createCanvas(fullW, fullH);
            const fullCtx = fullCanvas.getContext('2d');
            const cropCanvas = createCanvas(cropW, cropH);
            const cropCtx = cropCanvas.getContext('2d');
            const tempCanvas = createCanvas(fullW, fullH);
            const tempCtx = tempCanvas.getContext('2d');

            for (let i = 0; i < gifFrames.length; i += frameStep) {
                if (i >= gifFrames.length) break;
                
                const frame = gifFrames[i];
                if (i > 0 && gifFrames[Math.max(0, i - frameStep)].disposalType === 2) {
                     fullCtx.clearRect(0, 0, fullW, fullH);
                }
                
                const imageData = tempCtx.createImageData(frame.dims.width, frame.dims.height);
                imageData.data.set(new Uint8ClampedArray(frame.patch));
                tempCtx.putImageData(imageData, 0, 0);
                fullCtx.drawImage(
                    tempCanvas, 
                    0, 0, frame.dims.width, frame.dims.height, 
                    frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height
                );

                cropCtx.clearRect(0, 0, cropW, cropH);
                cropCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH); 
                encoder.setDelay(Math.max(frame.delay || 100, config.minFrameDelay));
                encoder.addFrame(cropCtx);
            }
            
            encoder.finish();
            fs.writeFileSync(iconStoragePath, encoder.out.getData());
            
            fullCanvas.width = 0;
            fullCanvas.height = 0;
            cropCanvas.width = 0;
            cropCanvas.height = 0;
            tempCanvas.width = 0;
            tempCanvas.height = 0;
            
        } else {
            const image = await loadImage(sourcePath);
            const canvas = createCanvas(cropW, cropH);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            fs.writeFileSync(iconStoragePath, canvas.toBuffer('image/png'));
            
            canvas.width = 0;
            canvas.height = 0;
        }
        
        return true;
    } catch (e) { 
        console.error("Error crop/resize:", e);
        return false; 
    }
}

function createSettingsWindow() {
    if (settingsWindow) { settingsWindow.focus(); return; }

    settingsWindow = new BrowserWindow({
        width: 850, height: 680, resizable: false,
        icon: getAppIcon(), 
        webPreferences: { 
            nodeIntegration: true, 
            contextIsolation: false,
            backgroundThrottling: false
        },
        title: 'Tray Icon Editor',
        autoHideMenuBar: true
    });

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css"/>
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 0; margin: 0; background: #1e1e1e; color: #eee; display: flex; height: 100vh; overflow: hidden; }
                .sidebar { width: 300px; padding: 20px; background: #252526; display: flex; flex-direction: column; gap: 15px; border-right: 1px solid #333; overflow-y: auto; }
                .main-area { flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; }
                
                h3 { margin: 0 0 10px 0; color: #fff; display: flex; align-items: center; gap: 8px; }
                .section { margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #3e3e42; }
                
                .btn { padding: 10px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: 0.2s; width: 100%; margin-bottom: 5px; display: flex; align-items: center; justify-content: center; gap: 6px;}
                .btn-primary { background: #0078d4; color: white; }
                .btn-primary:hover { background: #106ebe; }
                .btn-secondary { background: #3e3e42; color: white; }
                .btn-secondary:hover { background: #4d4d52; }
                
                input[type="number"] { padding: 8px; background: #333; border: 1px solid #555; color: white; width: 100%; border-radius: 4px; box-sizing: border-box; }
                
                .presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 5px; }
                .preset-btn { padding: 5px; font-size: 12px; background: #333; border: 1px solid #444; color: #ccc; cursor: pointer; border-radius: 3px; }
                .preset-btn:hover { background: #444; color: #fff; }

                .checkbox-wrapper { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; font-size: 14px;}
                .checkbox-wrapper input { width: 16px; height: 16px; accent-color: #0078d4; }

                /* Performance Mode Selector */
                .performance-modes { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
                .perf-mode { 
                    padding: 12px; 
                    background: #2d2d30; 
                    border: 2px solid #3e3e42; 
                    border-radius: 6px; 
                    cursor: pointer; 
                    transition: all 0.2s;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .perf-mode:hover { background: #333336; border-color: #555; }
                .perf-mode.active { 
                    background: #0d4d7a; 
                    border-color: #0078d4; 
                    box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.2);
                }
                .perf-mode-title { font-weight: 600; font-size: 14px; }
                .perf-mode-desc { font-size: 11px; color: #999; }
                .perf-mode.active .perf-mode-desc { color: #ccc; }

                img#imageToCrop { max-width: 100%; max-height: 100%; display: block; }
                .placeholder { text-align: center; color: #666; }
                .loading { position: absolute; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 99; color: white; display: none; }
                
                .info-box { background: #2d2d30; padding: 10px; border-radius: 4px; font-size: 12px; color: #ccc; margin-top: 10px; }
                .info-box strong { color: #0078d4; }
            </style>
        </head>
        <body>
            <div class="sidebar">
                <div class="section">
                    <h3>🛠️ Controls</h3>
                    <button class="btn btn-secondary" onclick="selectFile()">📂 Select Image (GIF/PNG/JPG)</button>
                    <button class="btn btn-secondary" onclick="openFolder()">📁 Open Saved Folder</button>
                </div>

                <div class="section">
                    <h3>⚙️ Performance Mode</h3>
                    <div class="performance-modes">
                        <div class="perf-mode" data-mode="light" onclick="selectPerformanceMode('light')">
                            <div class="perf-mode-title">Light</div>
                            <div class="perf-mode-desc">15 frames • ~100-150MB RAM</div>
                        </div>
                        <div class="perf-mode active" data-mode="balanced" onclick="selectPerformanceMode('balanced')">
                            <div class="perf-mode-title">Balanced </div>
                            <div class="perf-mode-desc">30 frames • ~150-250MB RAM</div>
                        </div>
                        <div class="perf-mode" data-mode="performance" onclick="selectPerformanceMode('performance')">
                            <div class="perf-mode-title">Performance</div>
                            <div class="perf-mode-desc">60 frames • ~300-500MB RAM</div>
                        </div>
                    </div>
                    <div class="info-box">
                        ℹ️ Change mode require <strong>Save & Apply</strong> again
                    </div>
                </div>

                <div class="section" id="cropControls" style="display:none; opacity: 0.5; pointer-events: none;">
                    <h3>📐 Size Settings</h3>
                    <label>Tray Size (px):</label>
                    <input type="number" id="displaySize" value="${currentSize}" min="16" max="128">
                    <div class="presets">
                        <button class="preset-btn" onclick="setSize(16)">16</button>
                        <button class="preset-btn" onclick="setSize(20)">20</button>
                        <button class="preset-btn" onclick="setSize(24)">24</button>
                        <button class="preset-btn" onclick="setSize(32)">32</button>
                        <button class="preset-btn" onclick="setSize(48)">48</button>
                        <button class="preset-btn" onclick="setSize(64)">64</button>
                    </div>
                    <br>
                    <button class="btn btn-primary" onclick="saveCrop()">💾 Save & Apply</button>
                    <p id="gifNotice" style="color: #ffcc00; font-size: 12px; margin-top: 10px; display: none;">Note: First frame only for cropping</p>
                </div>

                <div class="section" style="border: none;">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" id="startupCheck" onchange="toggleStartup()">
                        Run with Windows Startup
                    </label>
                </div>
            </div>

            <div class="main-area">
                <div class="loading" id="loadingOverlay">Processing... ⏳</div>
                <div class="placeholder" id="placeholder">
                    <h2>No Image Selected</h2>
                    <p>Select a GIF or Image to start editing</p>
                </div>
                <div><img id="imageToCrop" src=""></div>
            </div>

            <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js"></script>
            <script>
                const { ipcRenderer } = require('electron');
                let cropper;
                let originalPath = '';
                let originalFileType = '';
                let currentPerformanceMode = 'balanced';

                ipcRenderer.send('get-settings');

                function selectFile() { ipcRenderer.send('browse-file'); }
                function openFolder() { ipcRenderer.send('open-folder'); }
                function toggleStartup() { 
                    const isChecked = document.getElementById('startupCheck').checked;
                    ipcRenderer.send('toggle-startup', isChecked); 
                }
                function setSize(val) { document.getElementById('displaySize').value = val; }

                function selectPerformanceMode(mode) {
                    currentPerformanceMode = mode;
                    document.querySelectorAll('.perf-mode').forEach(el => {
                        el.classList.remove('active');
                    });
                    document.querySelector(\`[data-mode="\${mode}"]\`).classList.add('active');
                    ipcRenderer.send('change-performance-mode', mode);
                }

                ipcRenderer.on('file-loaded', (event, { base64, path, fileType }) => {
                    originalPath = path;
                    originalFileType = fileType; 
                    const img = document.getElementById('imageToCrop');
                    const controls = document.getElementById('cropControls');
                    const placeholder = document.getElementById('placeholder');

                    if (cropper) {
                        cropper.destroy();
                        cropper = null;
                    }
                    
                    placeholder.style.display = 'none';
                    controls.style.display = 'block';
                    controls.style.opacity = '1';
                    controls.style.pointerEvents = 'auto';

                    img.src = base64;
                    
                    document.getElementById('gifNotice').style.display = (fileType === 'gif') ? 'block' : 'none';

                    img.onload = () => {
                        cropper = new Cropper(img, {
                            aspectRatio: 1, 
                            viewMode: 1,
                            dragMode: 'move',
                            autoCropArea: 0.9,
                        });
                    };
                });

                ipcRenderer.on('settings-data', (event, { startup, performanceMode }) => {
                    document.getElementById('startupCheck').checked = startup;
                    currentPerformanceMode = performanceMode;
                    selectPerformanceMode(performanceMode);
                });

                function saveCrop() {
                    if (!cropper) return;
                    document.getElementById('loadingOverlay').style.display = 'flex';
                    const data = cropper.getData();
                    const size = parseInt(document.getElementById('displaySize').value);
                    
                    ipcRenderer.send('process-crop', {
                        filePath: originalPath,
                        cropData: data,
                        displaySize: size
                    });
                }

                ipcRenderer.on('process-complete', () => {
                    document.getElementById('loadingOverlay').style.display = 'none';
                    alert('Saved and applied successfully!');
                });
            </script>
        </body>
        </html>
    `;

    settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    settingsWindow.on('closed', () => { settingsWindow = null; });
}

function updateTrayMenu() {
    const config = getPerformanceConfig();
    const contextMenu = Menu.buildFromTemplate([
        { label: `${config.displayName}`, enabled: false },
        { label: `Size: ${currentSize}px | Frames: ${frames.length}/${config.maxFrames}`, enabled: false },
        { type: 'separator' },
        { label: '🛠️ Open Editor', click: createSettingsWindow },
        { label: '🔄 Reload', click: async () => { stopAnimation(); await loadTrayIcon(); startAnimation(); updateTrayMenu(); } },
        { type: 'separator' },
        { label: '❌ Quit', click: () => app.quit() },
        { type: 'separator' },
        { label: 'dat514', enabled: false } 
    ]);
    if (tray) tray.setContextMenu(contextMenu);
}

ipcMain.on('get-settings', (event) => {
    const loginSettings = app.getLoginItemSettings();
    event.sender.send('settings-data', { 
        startup: loginSettings.openAtLogin,
        performanceMode: performanceMode
    });
});

ipcMain.on('toggle-startup', (event, isEnabled) => {
    app.setLoginItemSettings({
        openAtLogin: isEnabled,
        path: process.execPath
    });
});

ipcMain.on('change-performance-mode', (event, mode) => {
    performanceMode = mode;
    saveSettings();
});

ipcMain.on('browse-file', async (event) => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['gif', 'jpg', 'jpeg', 'png'] }]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const buffer = fs.readFileSync(filePath);
        const type = getFileType(buffer);
        let base64 = '';

        if (type === 'gif') {
            try {
                const gif = GIF.parseGIF(buffer);
                const gifFrames = GIF.decompressFrames(gif, true);
                if (gifFrames && gifFrames.length > 0) {
                    const firstFrame = gifFrames[0];
                    const { width, height } = gifFrames[0].dims;
                    const canvas = createCanvas(width, height);
                    const ctx = canvas.getContext('2d');
                    const imageData = ctx.createImageData(width, height);
                    
                    imageData.data.set(new Uint8ClampedArray(firstFrame.patch)); 
                    ctx.putImageData(imageData, firstFrame.dims.left, firstFrame.dims.top);
                    base64 = canvas.toDataURL('image/png'); 
                    
                    canvas.width = 0;
                    canvas.height = 0;
                }
            } catch (e) {
                console.error("Lỗi xử lý GIF:", e);
                base64 = nativeImage.createFromBuffer(buffer).toDataURL();
            }
        } else {
            base64 = nativeImage.createFromBuffer(buffer).toDataURL();
        }

        event.sender.send('file-loaded', { 
            base64: base64, 
            path: filePath,
            fileType: type 
        });
    }
});

ipcMain.on('open-folder', () => {
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath);
    shell.openPath(userDataPath);
});

ipcMain.on('process-crop', async (event, { filePath, cropData, displaySize }) => {
    currentSize = displaySize;
    saveSettings();
    const success = await processAndSaveImage(filePath, cropData);
    if (success) {
        stopAnimation();
        const loaded = await loadTrayIcon();
        if (loaded) {
            if (tray) tray.destroy();
            tray = new Tray(frames[0].image); 
            updateTrayMenu();
            startAnimation();
        }
        event.sender.send('process-complete');
    }
});

app.whenReady().then(async () => {
    loadSettings();
    await loadTrayIcon();
    
    const trayImage = frames.length > 0 ? frames[0].image : nativeImage.createFromPath(getAppIcon() || '');
    
    tray = new Tray(trayImage);
    tray.setToolTip('Tray Animator');
    updateTrayMenu();
    startAnimation();
});

app.on('window-all-closed', () => {
});

app.on('before-quit', () => {
    stopAnimation();
    clearFrames();
});