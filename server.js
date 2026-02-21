const express = require('express');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let botState = {
    isRunning: false,
    processed: 0,
    successful: 0,
    total: 0,
    shouldStop: false
};

let clients = [];

// Server-Sent Events للتواصل المباشر
app.get('/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    
    clients.push(newClient);
    console.log(`✅ Client ${clientId} connected`);

    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
        console.log(`❌ Client ${clientId} disconnected`);
    });
});

// إرسال تحديث لجميع العملاء
function broadcastToClients(data) {
    clients.forEach(client => {
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}

// دالة جلب CSRF Token الحقيقية
async function getCsrfToken(cookie, proxyUrl = null) {
    try {
        const config = {
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            }
        };

        // إضافة بروكسي إذا وجد
        if (proxyUrl) {
            config.httpsAgent = new HttpsProxyAgent(proxyUrl);
        }

        const response = await axios.post('https://auth.roblox.com/v2/logout', {}, config);
        
        // CSRF token يكون في الهيدر
        return response.headers['x-csrf-token'];
    } catch (error) {
        if (error.response && error.response.headers) {
            return error.response.headers['x-csrf-token'];
        }
        return null;
    }
}

// دالة المتابعة الحقيقية
async function followUser(cookie, accountNum, targetId, proxyUrl = null) {
    try {
        // جلب CSRF Token
        broadcastToClients({
            message: `[الحساب ${accountNum}] جلب CSRF Token...`,
            type: 'info',
            processed: botState.processed,
            successful: botState.successful,
            completed: false
        });

        const csrfToken = await getCsrfToken(cookie, proxyUrl);
        
        if (!csrfToken) {
            broadcastToClients({
                message: `[الحساب ${accountNum}] ❌ فشل في جلب CSRF Token - كوكي غير صالح`,
                type: 'error',
                processed: botState.processed,
                successful: botState.successful,
                completed: false
            });
            return false;
        }

        broadcastToClients({
            message: `[الحساب ${accountNum}] ✅ تم جلب CSRF Token`,
            type: 'success',
            processed: botState.processed,
            successful: botState.successful,
            completed: false
        });

        // تجهيز طلب المتابعة
        const config = {
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'X-CSRF-TOKEN': csrfToken,
                'Content-Type': 'application/json'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            }
        };

        if (proxyUrl) {
            config.httpsAgent = new HttpsProxyAgent(proxyUrl);
        }

        // إرسال طلب المتابعة
        const response = await axios.post(
            `https://friends.roblox.com/v1/users/${targetId}/follow`,
            {},
            config
        );

        if (response.status === 200) {
            broadcastToClients({
                message: `[الحساب ${accountNum}] ✅ تمت المتابعة بنجاح!`,
                type: 'success',
                processed: botState.processed,
                successful: botState.successful,
                completed: false
            });
            return true;
        } else {
            const errorMsg = response.data?.errors?.[0]?.message || 'خطأ غير معروف';
            broadcastToClients({
                message: `[الحساب ${accountNum}] ❌ فشل: ${errorMsg}`,
                type: 'error',
                processed: botState.processed,
                successful: botState.successful,
                completed: false
            });
            return false;
        }
    } catch (error) {
        let errorMessage = error.message;
        if (error.response?.data?.errors?.[0]?.message) {
            errorMessage = error.response.data.errors[0].message;
        }
        
        broadcastToClients({
            message: `[الحساب ${accountNum}] ❌ خطأ: ${errorMessage}`,
            type: 'error',
            processed: botState.processed,
            successful: botState.successful,
            completed: false
        });
        return false;
    }
}

// تشغيل البوت
async function runBot(targetId, proxyUrl, cookies) {
    botState.isRunning = true;
    botState.processed = 0;
    botState.successful = 0;
    botState.total = cookies.length;
    botState.shouldStop = false;

    broadcastToClients({
        message: `🚀 بدء تشغيل البوت مع ${cookies.length} حساب`,
        type: 'success',
        processed: 0,
        successful: 0,
        completed: false
    });

    broadcastToClients({
        message: `🎯 المستهدف: ${targetId}`,
        type: 'info',
        processed: 0,
        successful: 0,
        completed: false
    });

    if (proxyUrl) {
        broadcastToClients({
            message: `🌐 استخدام بروكسي: ${proxyUrl}`,
            type: 'info',
            processed: 0,
            successful: 0,
            completed: false
        });
    }

    for (let i = 0; i < cookies.length; i++) {
        if (botState.shouldStop) {
            broadcastToClients({
                message: `⏹️ تم إيقاف البوت من قبل المستخدم`,
                type: 'warning',
                processed: botState.processed,
                successful: botState.successful,
                completed: true
            });
            break;
        }

        const success = await followUser(cookies[i], i + 1, targetId, proxyUrl);
        
        botState.processed++;
        if (success) {
            botState.successful++;
        }

        // تحديث الإحصائيات
        broadcastToClients({
            message: `📊 تقدم: ${botState.processed}/${botState.total} - نجاح: ${botState.successful}`,
            type: 'info',
            processed: botState.processed,
            successful: botState.successful,
            completed: false
        });

        // تأخير بين الحسابات
        if (i < cookies.length - 1 && !botState.shouldStop) {
            broadcastToClients({
                message: `⏳ انتظار 2 ثانية قبل الحساب التالي...`,
                type: 'info',
                processed: botState.processed,
                successful: botState.successful,
                completed: false
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    broadcastToClients({
        message: `✅ اكتمل! تمت معالجة ${botState.processed} حساب، نجح ${botState.successful}`,
        type: 'success',
        processed: botState.processed,
        successful: botState.successful,
        completed: true
    });

    botState.isRunning = false;
}

// API endpoints
app.post('/start', (req, res) => {
    const { targetId, proxyUrl, cookies } = req.body;
    
    if (!targetId || !cookies || cookies.length === 0) {
        return res.status(400).json({ error: 'البيانات المطلوبة ناقصة' });
    }
    
    if (botState.isRunning) {
        return res.json({ message: 'البوت يعمل بالفعل' });
    }
    
    // تشغيل البوت في الخلفية
    runBot(targetId, proxyUrl, cookies).catch(error => {
        console.error('خطأ في البوت:', error);
        broadcastToClients({
            message: `❌ خطأ في البوت: ${error.message}`,
            type: 'error',
            processed: botState.processed,
            successful: botState.successful,
            completed: true
        });
        botState.isRunning = false;
    });
    
    res.json({ message: 'تم بدء البوت بنجاح' });
});

app.post('/stop', (req, res) => {
    if (botState.isRunning) {
        botState.shouldStop = true;
        res.json({ message: 'جاري إيقاف البوت...' });
    } else {
        res.json({ message: 'البوت ليس قيد التشغيل' });
    }
});

app.get('/status', (req, res) => {
    res.json({
        isRunning: botState.isRunning,
        processed: botState.processed,
        successful: botState.successful,
        total: botState.total
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 سيرفر روبوت روبلوكس شغال على http://localhost:3000');
    console.log('📝 طريقة التشغيل:');
    console.log('1. شغل السيرفر: node server.js');
    console.log('2. افتح index.html في المتصفح');
    console.log('3. أضف الكوكيز الحقيقية وابدأ');
    console.log('='.repeat(50));
});
