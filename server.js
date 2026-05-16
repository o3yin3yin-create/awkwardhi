const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express(); // تم تصليح الغلطة هنا
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

let waitingUsers = [];
const bannedIPs = new Set();
const reportCounts = new Map();

// قائمة الكلمات المحظورة
const bannedWords = [
    'nudes', 'sex',
    'horny', 'snapchat', 'send pics', 'onlyfans',
    'fuck', 'bitch', 'shit', 'asshole', 'dick', 'pussy', 'slut', 'whore',
];

// دالة حصرية بتعد الناس الأونلاين وتبعتهالهم لايف
function broadcastOnlineCount() {
    const count = wss.clients.size;
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'online_count', count: count }));
        }
    });
}

wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (bannedIPs.has(ip)) {
        ws.send(JSON.stringify({ type: 'system', message: 'You are still banned. Your keyboard privileges have been revoked.' }));
        ws.close();
        return;
    }

    // أول ما اليوزر يدخل، السيرفر يبعت الرقم الجديد لكل الناس
    broadcastOnlineCount();

    ws.userIP = ip;
    ws.messageTimestamps = [];

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // استقبال البنج عشان السيرفر يفضل مصحصح وميقفلش الشات
        if (data.type === 'ping') return;

        if (data.type === 'start') {
            const userInterests = data.interests || [];
            const userFlag = data.flag || '';
            const userGender = data.gender || 'male'; 
            let partnerIndex = -1;

            console.log(`[Analytics] A ${userGender} connected from IP: ${ip}`);

            if (userInterests.length > 0) {
                partnerIndex = waitingUsers.findIndex(u => 
                    u.interests.some(interest => userInterests.includes(interest))
                );
            }

            if (partnerIndex === -1 && waitingUsers.length > 0) {
                partnerIndex = 0;
            }

            if (partnerIndex !== -1) {
                const partnerData = waitingUsers.splice(partnerIndex, 1)[0];
                const partnerWs = partnerData.ws;

                ws.partner = partnerWs;
                partnerWs.partner = ws;

                const commonInterests = userInterests.filter(i => partnerData.interests.includes(i));
                
                const wsDots = partnerData.gender === 'female' ? '...' : '..';
                const partnerDots = userGender === 'female' ? '...' : '..';

                let msgForUser = `You're now chatting with a stranger ${partnerData.flag}${wsDots}`;
                let msgForPartner = `You're now chatting with a stranger ${userFlag}${partnerDots}`;

                if (commonInterests.length > 0) {
                    const interestText = ` - You both somehow like: ${commonInterests.join(', ')}`;
                    msgForUser += interestText;
                    msgForPartner += interestText;
                }

                ws.send(JSON.stringify({ type: 'system', message: msgForUser.trim() }));
                partnerWs.send(JSON.stringify({ type: 'system', message: msgForPartner.trim() }));
            } else {
                waitingUsers.push({ ws: ws, interests: userInterests, flag: userFlag, gender: userGender });
            }
        }

        else if (data.type === 'typing') {
            if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
                ws.partner.send(JSON.stringify({ type: 'typing' }));
            }
        }

        else if (data.type === 'chat') {
            const now = Date.now();
            ws.messageTimestamps.push(now);
            ws.messageTimestamps = ws.messageTimestamps.filter(t => now - t < 3000);
            
            if (ws.messageTimestamps.length > 5) {
                bannedIPs.add(ws.userIP);
                ws.send(JSON.stringify({ type: 'system', message: 'Banned for spamming. Did your cat fall asleep on the enter key?' }));
                if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
                    ws.partner.send(JSON.stringify({ type: 'system', message: 'Stranger got banned for spamming like a broken bot.' }));
                    ws.partner.partner = null;
                }
                ws.close();
                return;
            }

            const isBanned = bannedWords.some(word => data.message.toLowerCase().includes(word.toLowerCase()));
            if (isBanned) {
                bannedIPs.add(ws.userIP);
                ws.send(JSON.stringify({ type: 'system', message: 'Banned for having a dirty mouth. Go wash it with soap and rethink your life choices.' }));
                if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
                    ws.partner.send(JSON.stringify({ type: 'system', message: 'Stranger was banned for acting like a 12-year-old. You are safe now.' }));
                    ws.partner.partner = null;
                }
                ws.close();
                return;
            }

            if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
                ws.partner.send(JSON.stringify({ type: 'chat', message: data.message }));
            }
        }

        else if (data.type === 'report') {
            if (ws.partner) {
                const partnerIP = ws.partner.userIP;
                let currentReports = reportCounts.get(partnerIP) || 0;
                currentReports++;
                reportCounts.set(partnerIP, currentReports);

                ws.send(JSON.stringify({ type: 'system', message: 'Stranger reported. We threw them in the trash.' }));

                if (currentReports >= 10) {
                    bannedIPs.add(partnerIP);
                    if (ws.partner.readyState === WebSocket.OPEN) {
                        ws.partner.send(JSON.stringify({ type: 'system', message: '10 people reported you. It is not them, it is definitely you. Enjoy your permanent ban.' }));
                    }
                } else {
                    if (ws.partner.readyState === WebSocket.OPEN) {
                        ws.partner.send(JSON.stringify({ type: 'system', message: 'They reported you and left. Ouch.' }));
                    }
                }

                if (ws.partner.readyState === WebSocket.OPEN) {
                    ws.partner.partner = null;
                    ws.partner.close();
                }
                ws.partner = null;
            }
        }
    });

    ws.on('close', () => {
        waitingUsers = waitingUsers.filter(u => u.ws !== ws);
        if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
            ws.partner.send(JSON.stringify({ type: 'system', message: 'They left. Probably because of something you said.' }));
            ws.partner.partner = null;
        }
        
        // أول ما اليوزر يخرج، السيرفر يقلل الرقم ويبعته للكل
        broadcastOnlineCount();
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`السيرفر شغال وزي الفل على http://localhost:${PORT}`);
});