// script.js - النسخة الحقيقية التي تعمل مع API روبلوكس

let isRunning = false;
let shouldStop = false;
let eventSource = null;

let stats = {
    total: 0,
    processed: 0,
    successful: 0
};

// إضافة حقول الكوكيز
document.addEventListener('DOMContentLoaded', () => {
    addCookieEntry();
    addCookieEntry();
    updateTimestamp();
    checkServerConnection();
});

function addCookieEntry(value = '') {
    const container = document.getElementById('cookies-container');
    const entryDiv = document.createElement('div');
    entryDiv.className = 'cookie-entry';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '_|WARNING:-DO-NOT-SHARE-...';
    input.value = value;
    input.dir = 'ltr';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-cookie';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = function() {
        container.removeChild(entryDiv);
        updateStats();
    };
    
    entryDiv.appendChild(input);
    entryDiv.appendChild(removeBtn);
    container.appendChild(entryDiv);
    
    input.addEventListener('input', updateStats);
    updateStats();
}

function updateStats() {
    const cookieInputs = document.querySelectorAll('.cookie-entry input');
    const validCookies = Array.from(cookieInputs).filter(input => input.value.trim() !== '');
    
    stats.total = validCookies.length;
    document.getElementById('totalAccounts').textContent = stats.total;
}

function updateProgress() {
    if (stats.total > 0) {
        const percentage = (stats.processed / stats.total) * 100;
        document.getElementById('progressFill').style.width = percentage + '%';
    }
}

function addStatus(message, type = 'info') {
    const statusDiv = document.getElementById('statusMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `status-message ${type}`;
    
    const timestamp = new Date().toLocaleTimeString('ar-EG');
    messageDiv.textContent = `[${timestamp}] ${message}`;
    
    statusDiv.appendChild(messageDiv);
    statusDiv.scrollTop = statusDiv.scrollHeight;
}

function updateTimestamp() {
    const now = new Date();
    document.getElementById('timestamp').textContent = now.toLocaleString('ar-EG');
    setTimeout(updateTimestamp, 1000);
}

function checkServerConnection() {
    fetch('http://localhost:3000/status')
        .then(response => response.json())
        .then(data => {
            document.getElementById('statusText').className = 'online';
            document.getElementById('statusText').textContent = 'متصل';
            addStatus('✅ تم الاتصال بالسيرفر بنجاح', 'success');
        })
        .catch(error => {
            document.getElementById('statusText').className = 'offline';
            document.getElementById('statusText').textContent = 'غير متصل';
            addStatus('❌ السيرفر غير متصل! شغّل السيرفر أولاً', 'error');
        });
}

function startBot() {
    if (isRunning) {
        addStatus('⚠️ البوت يعمل بالفعل!', 'warning');
        return;
    }

    const targetId = document.getElementById('targetId').value.trim();
    const proxyUrl = document.getElementById('proxyUrl').value.trim();

    if (!targetId) {
        addStatus('❌ الرجاء إدخال معرف المستخدم المستهدف!', 'error');
        return;
    }

    // جمع الكوكيز
    const cookies = [];
    document.querySelectorAll('.cookie-entry input').forEach(input => {
        const cookie = input.value.trim();
        if (cookie) {
            cookies.push(cookie);
        }
    });

    if (cookies.length === 0) {
        addStatus('❌ الرجاء إضافة كوكي واحد على الأقل!', 'error');
        return;
    }

    // إرسال الطلب إلى السيرفر
    fetch('http://localhost:3000/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            targetId,
            proxyUrl: proxyUrl || null,
            cookies
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            addStatus(`❌ ${data.error}`, 'error');
            return;
        }
        
        addStatus('🚀 تم بدء البوت بنجاح', 'success');
        isRunning = true;
        shouldStop = false;
        
        // إعادة تعيين الإحصائيات
        stats.processed = 0;
        stats.successful = 0;
        document.getElementById('processedAccounts').textContent = '0';
        document.getElementById('successful').textContent = '0';
        
        // بدء استقبال التحديثات المباشرة
        connectToServerSentEvents();
    })
    .catch(error => {
        addStatus(`❌ فشل الاتصال بالسيرفر: ${error.message}`, 'error');
    });
}

function stopBot() {
    if (!isRunning) {
        addStatus('⚠️ البوت ليس قيد التشغيل', 'warning');
        return;
    }

    fetch('http://localhost:3000/stop', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        addStatus(data.message, 'warning');
        shouldStop = true;
        
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    })
    .catch(error => {
        addStatus(`❌ فشل إيقاف البوت: ${error.message}`, 'error');
    });
}

function connectToServerSentEvents() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource('http://localhost:3000/events');

    eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        // تحديث الإحصائيات
        stats.processed = data.processed;
        stats.successful = data.successful;
        
        document.getElementById('processedAccounts').textContent = stats.processed;
        document.getElementById('successful').textContent = stats.successful;
        
        // إضافة الرسالة
        if (data.message) {
            addStatus(data.message, data.type);
        }
        
        // تحديث شريط التقدم
        updateProgress();
        
        // إذا انتهى البوت
        if (data.completed) {
            isRunning = false;
            eventSource.close();
            eventSource = null;
            addStatus('✅ اكتمل تشغيل البوت', 'success');
        }
    };

    eventSource.onerror = function() {
        if (!shouldStop) {
            addStatus('❌ انقطع الاتصال بالسيرفر', 'error');
        }
        isRunning = false;
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    };
}

// دالة مساعدة للتأخير
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// جعل الدوال متاحة عالمياً
window.addCookieEntry = addCookieEntry;
window.startBot = startBot;
window.stopBot = stopBot;
