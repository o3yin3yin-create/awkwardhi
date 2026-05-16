console.log('%c Made with 🇪🇬 tea and zero sleep by 6afra', 'color: #F8C61E; background: #252C37; font-size: 16px; padding: 10px; border-radius: 5px;');

const themeSwitch = document.getElementById('theme-switch');
const actionBtn = document.getElementById('action-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatBox = document.getElementById('chat-box');
const interestsInput = document.getElementById('interests-input');
const reportBtn = document.getElementById('report-btn');
const typingIndicator = document.getElementById('typing-indicator');
const genderButtons = document.querySelectorAll('.gender-btn');

const popSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');

let ws; 
let isChatting = false; 
let userFlag = ''; 
let selectedGender = ''; // لتخزين اختيار الجيندر
let typingTimeout;
let lastTypingTime = 0;

// منطق اختيار الجيندر وتفعيل زرار Start (مدمج بدعم الموبايل والكمبيوتر)
genderButtons.forEach(btn => {
    const handleGenderSelect = (e) => {
        // نمنع السلوك الافتراضي في التاتش عشان ميعملش double click أو يهنج
        if (e.type === 'touchend') e.preventDefault(); 
        
        genderButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedGender = btn.getAttribute('data-gender');
        
        console.log("Selected Gender:", selectedGender); // للتأكد في الـ Console

        // فك الحظر عن زرار Start لو لسه مبدأناش شات
        if (!isChatting && actionBtn) {
            actionBtn.disabled = false;
            actionBtn.removeAttribute('disabled');
        }
    };

    btn.addEventListener('click', handleGenderSelect);
    btn.addEventListener('touchend', handleGenderSelect);
});

async function fetchUserFlag() {
    try {
        const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
        const data = await res.json();
        if (data.country_code) {
            userFlag = data.country_code.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
        }
    } catch (error) {}
}
fetchUserFlag();

themeSwitch.addEventListener('change', () => {
    document.documentElement.setAttribute('data-theme', themeSwitch.checked ? 'dark' : 'light');
});

function addMessage(sender, text, isSystem = false) {
    const msgDiv = document.createElement('div');
    if (isSystem) {
        msgDiv.className = 'system-msg';
        msgDiv.textContent = text;
    } else {
        msgDiv.className = 'message';
        const senderSpan = document.createElement('span');
        senderSpan.className = sender === 'You' ? 'you' : 'stranger';
        senderSpan.textContent = `${sender}: `;
        msgDiv.appendChild(senderSpan);
        msgDiv.appendChild(document.createTextNode(text));
    }
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function clearChat() { chatBox.innerHTML = ''; }

function connectToServer() {
    // تم التحديث للينك الـ Production الجديد على Railway بنجاح
    ws = new WebSocket('wss://awkwardhi-production.up.railway.app');

    ws.onopen = () => {
        const interests = interestsInput.value.split(',').map(i => i.trim()).filter(i => i);
        // نبعت الاهتمامات، العلم، والجيندر المختار للسيرفر
        ws.send(JSON.stringify({ type: 'start', interests: interests, flag: userFlag, gender: selectedGender }));
        
        clearChat();
        addMessage('System', 'Searching for another bored human...', true);
        messageInput.disabled = false;
        sendBtn.disabled = false;
        actionBtn.innerHTML = 'Skip';
        isChatting = true;
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'system') {
            addMessage('System', data.message, true);
        } else if (data.type === 'chat') {
            typingIndicator.classList.add('hidden');
            addMessage('Stranger', data.message);
            popSound.play().catch(()=>{});
        } else if (data.type === 'typing') {
            typingIndicator.classList.remove('hidden');
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                typingIndicator.classList.add('hidden');
            }, 2000);
        }
    };

    ws.onclose = () => {
        addMessage('System', 'Nobody wants to talk to you right now. Try again.', true);
        resetChatState();
    };
}

function resetChatState() {
    isChatting = false;
    messageInput.disabled = true;
    sendBtn.disabled = true;
    messageInput.value = '';
    actionBtn.innerHTML = 'Start';
    typingIndicator.classList.add('hidden');
    // نرجع نقفل الزرار لو مفيش جيندر متحدد
    if (!selectedGender) {
        actionBtn.disabled = true;
    }
}

actionBtn.addEventListener('click', () => {
    if (!isChatting) { connectToServer(); } 
    else { if (ws) ws.close(); connectToServer(); }
});

function sendMessage() {
    const text = messageInput.value.trim();
    if (text && ws && ws.readyState === WebSocket.OPEN) {
        addMessage('You', text);
        ws.send(JSON.stringify({ type: 'chat', message: text }));
        messageInput.value = '';
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

messageInput.addEventListener('input', () => {
    const now = Date.now();
    if (now - lastTypingTime > 1500 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'typing' }));
        lastTypingTime = now;
    }
});

reportBtn.addEventListener('click', () => {
    if (isChatting && ws && ws.readyState === WebSocket.OPEN) {
        const confirmReport = confirm('Are you sure you want to report this stranger and leave?');
        if (confirmReport) {
            ws.send(JSON.stringify({ type: 'report' }));
            resetChatState();
        }
    } else {
        alert('You are not chatting with anyone right now!');
    }
});