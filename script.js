let mediaRecorder;
let audioChunks = [];
let timerInterval;
let startTime;

// --- Audio Visualization Variables ---
let audioContext;
let analyser;
let dataArray;
let source;
let visualizerAnimationId;
const canvas = document.getElementById('audio-visualizer');
const canvasCtx = canvas.getContext('2d');

// Elements
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const authSection = document.getElementById('auth-section');
const mainInterface = document.getElementById('main-interface');

const recordBtn = document.getElementById('record-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('timer-display');
const statusText = document.getElementById('status-text');

const rawTextArea = document.getElementById('raw-text');
const refineBtn = document.getElementById('refine-btn');
const refinedOutput = document.getElementById('refined-output');
const finishBtn = document.getElementById('finish-btn');
const copyBtn = document.getElementById('copy-btn'); // دکمه جدید

// 1. Auth Logic
saveKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.value.trim().length > 10) {
        // انیمیشن محو شدن
        authSection.style.opacity = '0';
        authSection.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            authSection.style.display = 'none';
            mainInterface.classList.remove('hidden');
            // انیمیشن ظاهر شدن
            mainInterface.style.opacity = '0';
            mainInterface.style.transform = 'translateY(20px)';
            requestAnimationFrame(() => {
                mainInterface.style.transition = 'all 0.5s ease';
                mainInterface.style.opacity = '1';
                mainInterface.style.transform = 'translateY(0)';
            });
        }, 300);
    } else {
        alert("لطفا یک API Key معتبر وارد کنید.");
    }
});

// 2. Timer Logic
function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const totalSeconds = Math.floor(elapsedTime / 1000);
        const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');
        timerDisplay.innerText = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerDisplay.innerText = "00:00";
}

// 3. Helper: Blob to Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// --- 4. Audio Visualizer Logic (جدید) ---
function setupVisualizer(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256; // سایز بافر برای دقت ویژوالایزر
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    drawVisualizer();
}

function drawVisualizer() {
    visualizerAnimationId = requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);

    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0)'; // پس زمینه شفاف
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;

    for(let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 1.5;
        
        // ایجاد گرادینت نئونی برای موج‌ها
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#8A2BE2'); // بنفش
        gradient.addColorStop(1, '#00CED1'); // آبی

        canvasCtx.fillStyle = gradient;
        // رسم میله‌ها از وسط به بالا و پایین برای تقارن
        canvasCtx.fillRect(x, canvas.height / 2 - barHeight / 2, barWidth, barHeight);

        x += barWidth + 1;
    }
}

function stopVisualizer() {
    if (visualizerAnimationId) {
        cancelAnimationFrame(visualizerAnimationId);
    }
    if (audioContext) {
        audioContext.close();
    }
    // پاک کردن کانواس
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}


// 5. Recording Logic
recordBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // شروع ویژوالایزر
        setupVisualizer(stream);

        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
        mediaRecorder.onstop = processAudioDirectly;

        mediaRecorder.start();
        
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        finishBtn.disabled = true;
        refineBtn.disabled = true;
        copyBtn.classList.add('hidden'); // مخفی کردن دکمه کپی
        statusText.innerText = "🎙️ در حال ضبط صدای شما...";
        statusText.style.color = "var(--neon-red)";
        startTimer();

    } catch (err) {
        console.error(err);
        alert("دسترسی به میکروفون امکان‌پذیر نیست.");
    }
});

stopBtn.addEventListener('click', () => {
    if (mediaRecorder) {
        mediaRecorder.stop();
        stopTimer();
        stopVisualizer(); // توقف ویژوالایزر
        recordBtn.disabled = false;
        stopBtn.disabled = true;
        statusText.innerText = "⏳ در حال ارسال به هوش مصنوعی...";
        statusText.style.color = "var(--text-secondary)";
    }
});

// 6. DIRECT Gemini API Call (Transcribe)
async function processAudioDirectly() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const apiKey = apiKeyInput.value.trim();
    
    try {
        const base64Audio = await blobToBase64(audioBlob);
        const MODEL_NAME = "gemini-2.5-flash"; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

        const promptText = `Listen explicitly. Transcribe exactly what is said. The speaker uses a mix of English and Persian. Write Persian in Persian script, English in English. Do not translate yet.`;

        const payload = {
            contents: [{
                parts: [{ text: promptText }, { inline_data: { mime_type: "audio/webm", data: base64Audio } }]
            }]
        };

        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();

        if (data.candidates && data.candidates[0].content) {
            rawTextArea.value = data.candidates[0].content.parts[0].text;
            statusText.innerText = "✅ متن آماده پردازش است.";
            statusText.style.color = "var(--neon-green)";
            refineBtn.disabled = false;
            finishBtn.disabled = false;
        } else {
            throw new Error("پاسخ نامعتبر از API");
        }
    } catch (error) {
        console.error(error);
        statusText.innerText = "❌ خطای شبکه یا API";
        statusText.style.color = "var(--neon-red)";
    }
}

// 7. Grammar Check Logic (Refine)
refineBtn.addEventListener('click', async () => {
    const text = rawTextArea.value;
    const apiKey = apiKeyInput.value.trim();
    if (!text) return;

    statusText.innerText = "🧠 هوش مصنوعی در حال فکر کردن...";
    refineBtn.disabled = true;
    refinedOutput.innerHTML = '<div class="empty-state">در حال آنالیز و جادوگری... ✨</div>';
    copyBtn.classList.add('hidden'); // مخفی کردن دکمه کپی حین پردازش

    try {
        const MODEL_NAME = "gemini-2.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

        const systemPrompt = `
        You are a professional bilingual editor. Goal: Produce a "Simplified, Clarified, and Translated" English version of the input (mixed English/Persian).
        RULES: 1. Translate Persian to English. 2. Simplify vocabulary. 3. Clarify meaning naturally.
        OUTPUT: JSON object with key "markedUpText". Use these XML tags for changes:
        - <TRANSLATE original="..." reason="...">...</TRANSLATE>
        - <CORRECT original="..." reason="...">...</CORRECT>
        - <SUGGEST original="..." reason="...">...</SUGGEST>
        Input: ${text}
        `;

        const payload = {
            contents: [{ parts: [{ text: systemPrompt }] }],
            generation_config: { response_mime_type: "application/json" }
        };

        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        
        let jsonStr = data.candidates[0].content.parts[0].text;
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        const parsedData = JSON.parse(jsonStr);

        if (parsedData.markedUpText) {
             let html = parsedData.markedUpText
                .replace(/<CORRECT original=['"](.*?)['"] reason=['"](.*?)['"]>(.*?)<\/CORRECT>/g, 
                    '<span class="highlight correction-red" data-reason="$2 (اصلی: $1)">$3</span>')
                .replace(/<SUGGEST original=['"](.*?)['"] reason=['"](.*?)['"]>(.*?)<\/SUGGEST>/g, 
                    '<span class="highlight suggestion-yellow" data-reason="$2 (اصلی: $1)">$3</span>')
                .replace(/<TRANSLATE original=['"](.*?)['"] reason=['"](.*?)['"]>(.*?)<\/TRANSLATE>/g, 
                    '<span class="highlight translation-blue" data-reason="$2 (اصلی: $1)">$3</span>');
            
            refinedOutput.innerHTML = html;
            statusText.innerText = "✨ اصلاحات انجام شد.";
            copyBtn.classList.remove('hidden'); // نمایش دکمه کپی
        }

    } catch (error) {
        console.error(error);
        refinedOutput.innerHTML = '<div class="empty-state" style="color:var(--neon-red)">خطا در ارتباط با Gemini.</div>';
    } finally {
        refineBtn.disabled = false;
    }
});

// 8. Copy Functionality (جدید)
copyBtn.addEventListener('click', () => {
    // گرفتن متن خالص بدون تگ‌های HTML
    const textToCopy = refinedOutput.innerText;
    
    if (textToCopy && !textToCopy.includes("منتظر پردازش")) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            // فیدبک موفقیت
            const originalLabel = copyBtn.querySelector('.copy-label').innerText;
            const originalIcon = copyBtn.querySelector('.copy-icon').innerHTML;
            
            copyBtn.classList.add('success');
            copyBtn.querySelector('.copy-label').innerText = "کپی شد!";
            copyBtn.querySelector('.copy-icon').innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>'; // آیکون تیک

            // بازگشت به حالت اول بعد از 2 ثانیه
            setTimeout(() => {
                copyBtn.classList.remove('success');
                copyBtn.querySelector('.copy-label').innerText = originalLabel;
                copyBtn.querySelector('.copy-icon').innerHTML = originalIcon;
            }, 2000);
        }).catch(err => {
            console.error('خطا در کپی:', err);
        });
    }
});


// 9. Cleanup
finishBtn.addEventListener('click', () => {
    if (confirm("آیا مطمئن هستید؟ صفحه ریست می‌شود.")) {
        rawTextArea.value = "";
        refinedOutput.innerHTML = '<div class="empty-state">منتظر پردازش...</div>';
        statusText.innerText = "آماده برای شنیدن...";
        statusText.style.color = "var(--text-secondary)";
        finishBtn.disabled = true;
        refineBtn.disabled = true;
        copyBtn.classList.add('hidden');
        stopVisualizer();
    }
});
