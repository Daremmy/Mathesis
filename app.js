/* ═══════════════════════════════════════════════════════
   MATHESIS — app.js
   All application logic in one file, clearly organized.
   Sections: Config → State → Auth → Supabase → TTS →
             Dashboard → Lessons → Flashcards → Quiz →
             Presentations → AI → Inbox → Progress → Init
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   SECTION 1 — CONFIGURATION (already set up for you)
═══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://fzvvjqlreuuwfdrhvlnu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6dnZqcWxyZXV1d2Zkcmh2bG51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTYwNDksImV4cCI6MjA4Nzk3MjA0OX0.Rak0Jxfv6L1dFz2ZD4gu8t5pAtJK_IYVBpCCA6W2RD4';
const GROQ_KEY = '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';
const ADMIN_NAME   = 'E_mathesis';

/* ═══════════════════════════════════════════════════════
   SECTION 2 — STATE
   S = all your local data. Saved to browser storage.
═══════════════════════════════════════════════════════ */
let S = {
  theme: 'light',
  profile: null,       // { name } of the logged-in user
  lessons: [],
  flashcards: [],
  quizHistory: [],
  presentations: [],
  activity: [],
  inbox: [],
};

let PROFILES = {};     // { name: { passwordHash, securityQ, securityA } }

function loadLocal() {
  try {
    const d = localStorage.getItem('mathesis_data');
    if (d) S = { ...S, ...JSON.parse(d) };
    const p = localStorage.getItem('mathesis_profiles');
    if (p) PROFILES = JSON.parse(p);
  } catch(e) {}
}

function save() {
  try { localStorage.setItem('mathesis_data', JSON.stringify(S)); } catch(e) {}
}

function saveProfiles() {
  try { localStorage.setItem('mathesis_profiles', JSON.stringify(PROFILES)); } catch(e) {}
}

/* ═══════════════════════════════════════════════════════
   SECTION 3 — SUPABASE DATABASE
   Powers: inbox sync, admin progress view.
   Tables needed: inbox, quiz_progress
   (created automatically on first use via the API)
═══════════════════════════════════════════════════════ */
async function dbInsert(table, row) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
    return r.ok;
  } catch(e) { return false; }
}

async function dbSelect(table, filters = '') {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (!r.ok) return [];
    return await r.json();
  } catch(e) { return []; }
}

async function dbDelete(table, filters = '') {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
  } catch(e) {}
}

/* ═══════════════════════════════════════════════════════
   SECTION 4 — AUTHENTICATION
═══════════════════════════════════════════════════════ */
function isAdmin() { return S.profile?.name === ADMIN_NAME; }

function hashPwd(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; }
  return 'h' + Math.abs(h).toString(36) + s.length;
}

function switchTab(tab) {
  ['login','signup','forgot'].forEach(t => {
    document.getElementById(`${t}-form`).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`tab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
}

function togglePwd(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.remove('hidden');
}

function login() {
  const name = document.getElementById('l-name').value.trim();
  const pwd  = document.getElementById('l-pwd').value;
  if (!name || !pwd) { showErr('l-err','Enter your name and password.'); return; }
  const p = PROFILES[name];
  if (!p) { showErr('l-err','No account found with that name.'); return; }
  if (hashPwd(pwd) !== p.passwordHash) { showErr('l-err','Incorrect password.'); return; }
  document.getElementById('l-err').classList.add('hidden');
  S.profile = { name };
  save();
  launchApp();
}

function signup() {
  const name  = document.getElementById('s-name').value.trim();
  const pwd   = document.getElementById('s-pwd').value;
  const pwd2  = document.getElementById('s-pwd2').value;
  const sq    = document.getElementById('s-sq').value;
  const sa    = document.getElementById('s-sa').value.trim().toLowerCase();
  if (!name) { showErr('s-err','Please enter a name.'); return; }
  if (PROFILES[name]) { showErr('s-err','That name is already taken.'); return; }
  if (!pwd || pwd.length < 3) { showErr('s-err','Password must be at least 3 characters.'); return; }
  if (pwd !== pwd2) { showErr('s-err','Passwords do not match.'); return; }
  if (!sa) { showErr('s-err','Please answer the security question.'); return; }
  PROFILES[name] = { passwordHash: hashPwd(pwd), securityQ: sq, securityA: hashPwd(sa) };
  saveProfiles();
  S.profile = { name };
  save();
  launchApp();
}

const SQ_LABELS = { pet:"What was your first pet's name?", school:'What primary school did you attend?', city:'What city were you born in?', mother:"What is your mother's middle name?" };

function findSecQ() {
  const name = document.getElementById('f-name').value.trim();
  if (!name || !PROFILES[name]) { showErr('f-err','No account found.'); return; }
  document.getElementById('f-q-label').textContent = SQ_LABELS[PROFILES[name].securityQ] || 'Security answer';
  document.getElementById('f-q-section').classList.remove('hidden');
  document.getElementById('f-find-btn').classList.add('hidden');
  document.getElementById('f-err').classList.add('hidden');
}

function resetPwd() {
  const name   = document.getElementById('f-name').value.trim();
  const ans    = document.getElementById('f-ans').value.trim().toLowerCase();
  const newPwd = document.getElementById('f-newpwd').value;
  const p = PROFILES[name];
  if (!p) return;
  if (hashPwd(ans) !== p.securityA) { showErr('f-err','Incorrect answer.'); return; }
  if (!newPwd || newPwd.length < 3) { showErr('f-err','Password must be at least 3 characters.'); return; }
  PROFILES[name].passwordHash = hashPwd(newPwd);
  saveProfiles();
  toast('Password reset! You can now log in.');
  switchTab('login');
}

function logout() {
  if (!confirm('Log out? Your data stays saved.')) return;
  S.profile = null; save(); stopSpeech();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').style.display = 'flex';
  switchTab('login');
  document.getElementById('l-name').value = '';
  document.getElementById('l-pwd').value = '';
}

function launchApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  const name = S.profile.name;
  // Update sidebar
  document.getElementById('sb-pname').textContent = name;
  document.getElementById('sb-avatar').textContent = name[0].toUpperCase();
  if (isAdmin()) document.getElementById('sb-badge').classList.remove('hidden');
  else document.getElementById('sb-badge').classList.add('hidden');
  applyTheme();
  nav('dashboard');
  loadInbox();
  // Register service worker for PWA/offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/* ═══════════════════════════════════════════════════════
   SECTION 5 — THEME & NAVIGATION
═══════════════════════════════════════════════════════ */
function toggleTheme() {
  S.theme = S.theme === 'light' ? 'dark' : 'light';
  applyTheme(); save();
}

function applyTheme() {
  document.body.dataset.theme = S.theme;
  const t = document.getElementById('theme-track');
  const l = document.getElementById('theme-lbl');
  if (S.theme === 'dark') { t.classList.add('on'); l.textContent = '🌙 Dark mode'; }
  else { t.classList.remove('on'); l.textContent = '☀️ Light mode'; }
}

function nav(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes(`'${page}'`)) n.classList.add('active');
  });
  stopSpeech();
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  const renders = {
    dashboard: renderDashboard, lessons: renderLessons, flashcards: renderFCList,
    quiz: setupQuiz, presentations: renderPresList, progress: renderProgress, inbox: () => {}
  };
  if (renders[page]) renders[page]();
}

function toggleMobSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function toast(msg, duration = 3000) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/* ═══════════════════════════════════════════════════════
   SECTION 6 — TEXT-TO-SPEECH
   Chunked for mobile. Pause, seek, skip supported.
═══════════════════════════════════════════════════════ */
let ttsActive = {};
let ttsQueue = [];
let ttsAllChunks = [];
let ttsCurrentBtn = null;
let ttsRate = 1.0;
let ttsChunkIdx = 0;
let ttsPaused = false;

function splitIntoChunks(text, maxLen = 180) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = s;
    } else { current += ' ' + s; }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

function ttsToggle(text, btnId) {
  if (ttsActive[btnId]) {
    if (ttsPaused) { ttsResume(); return; }
    ttsPause(); return;
  }
  speak(text, btnId);
}

function speak(text, btnId) {
  if (!text?.trim()) return;
  stopSpeech();
  const spdEl = document.getElementById(btnId.replace('tts','spd').replace('-tts','-spd'));
  ttsRate = spdEl ? parseFloat(spdEl.value) : 1.0;
  ttsAllChunks = splitIntoChunks(text.trim());
  ttsQueue = [...ttsAllChunks];
  ttsChunkIdx = 0;
  ttsCurrentBtn = btnId;
  ttsActive[btnId] = true;
  ttsPaused = false;
  setTTSState(btnId, true);
  updateSeek();
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) { speakNextChunk(); }
  else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      speakNextChunk();
    };
    setTimeout(speakNextChunk, 500);
  }
}

function speakNextChunk() {
  if (!ttsQueue.length || !ttsCurrentBtn) {
    setTTSState(ttsCurrentBtn, false);
    ttsActive = {}; ttsCurrentBtn = null; ttsPaused = false;
    updateSeek(); return;
  }
  const chunk = ttsQueue.shift();
  ttsChunkIdx = ttsAllChunks.length - ttsQueue.length - 1;
  const utt = new SpeechSynthesisUtterance(chunk);
  utt.rate = ttsRate;
  utt.lang = 'en-US';
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang.startsWith('en') && v.localService) ||
                voices.find(v => v.lang.startsWith('en')) || voices[0];
  if (voice) utt.voice = voice;
  utt.onend = () => { if (!ttsPaused) { updateSeek(); speakNextChunk(); } };
  utt.onerror = () => speakNextChunk();
  window.speechSynthesis.speak(utt);
  updateSeek();
}

function ttsPause() {
  window.speechSynthesis.pause();
  ttsPaused = true;
  const btn = document.getElementById(ttsCurrentBtn);
  if (btn) btn.textContent = '▶';
}

function ttsResume() {
  window.speechSynthesis.resume();
  ttsPaused = false;
  const btn = document.getElementById(ttsCurrentBtn);
  if (btn) btn.textContent = '⏸';
}

function ttsSkip(steps) {
  if (!ttsCurrentBtn) return;
  const newIdx = Math.max(0, Math.min(ttsAllChunks.length - 1, ttsChunkIdx + steps));
  const btn = ttsCurrentBtn;
  const text = ttsAllChunks.join(' ');
  window.speechSynthesis.cancel();
  ttsQueue = ttsAllChunks.slice(newIdx);
  ttsChunkIdx = newIdx;
  ttsPaused = false;
  speakNextChunk();
}

function ttsSeek(idx) {
  if (!ttsAllChunks.length) return;
  const newIdx = Math.max(0, Math.min(ttsAllChunks.length - 1, idx));
  window.speechSynthesis.cancel();
  ttsQueue = ttsAllChunks.slice(newIdx);
  ttsChunkIdx = newIdx;
  ttsPaused = false;
  speakNextChunk();
}

function ttsChangeSpeed() {
  if (!ttsCurrentBtn) return;
  const spdEl = document.getElementById(ttsCurrentBtn.replace('tts','spd').replace('-tts','-spd'));
  if (spdEl) { ttsRate = parseFloat(spdEl.value); }
  // Restart from current chunk with new speed
  const newIdx = ttsChunkIdx;
  window.speechSynthesis.cancel();
  ttsQueue = ttsAllChunks.slice(newIdx);
  ttsChunkIdx = newIdx;
  ttsPaused = false;
  speakNextChunk();
}

function updateSeek() {
  const total = ttsAllChunks.length;
  const idx = ttsChunkIdx;
  // Update all seek bars and counters
  ['les','ai'].forEach(prefix => {
    const seek = document.getElementById(prefix+'-seek');
    const counter = document.getElementById(prefix+'-counter');
    if (seek) { seek.max = Math.max(1, total-1); seek.value = idx; }
    if (counter) counter.textContent = total > 0 ? `${idx+1} / ${total}` : '—';
  });
}

function stopSpeech() {
  window.speechSynthesis.cancel();
  ttsQueue = []; ttsAllChunks = []; ttsChunkIdx = 0; ttsPaused = false;
  const btn = ttsCurrentBtn;
  ttsCurrentBtn = null;
  Object.keys(ttsActive).forEach(k => setTTSState(k, false));
  ttsActive = {};
  updateSeek();
}

function setTTSState(id, active) {
  if (id) ttsActive[id] = active;
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = active ? '⏸' : '🔊';
  btn.classList.toggle('active', active);
}

/* ═══════════════════════════════════════════════════════
   SECTION 7 — DASHBOARD
═══════════════════════════════════════════════════════ */
function renderDashboard() {
  const due = getDueCards(S.flashcards).length;
  document.getElementById('ds-lessons').textContent = S.lessons.length;
  document.getElementById('ds-cards').textContent = S.flashcards.length;
  document.getElementById('ds-quizzes').textContent = S.quizHistory.length;
  const avg = S.quizHistory.length
    ? Math.round(S.quizHistory.reduce((a,h) => a+h.pct, 0) / S.quizHistory.length) + '%' : '—';
  document.getElementById('ds-avg').textContent = avg;
  document.getElementById('dash-greeting').textContent =
    `Welcome back, ${S.profile?.name}!${due > 0 ? ` You have ${due} flashcard${due>1?'s':''} due for review.` : ''}`;
  const acts = [...S.activity].reverse().slice(0, 6);
  document.getElementById('dash-activity').innerHTML = acts.length
    ? acts.map(a => `<div style="display:flex;justify-content:space-between;padding:9px 12px;background:var(--bg2);border-radius:9px;margin-bottom:7px;font-size:13px;"><span>${a.text}</span><span class="muted xsmall">${a.date}</span></div>`).join('')
    : '<div class="empty-state" style="padding:24px 0;"><div class="empty-ico" style="font-size:32px;">📋</div><p>No activity yet</p></div>';
}

function logActivity(text) {
  S.activity.push({ text, date: new Date().toLocaleDateString() });
  if (S.activity.length > 50) S.activity = S.activity.slice(-50);
  save();
}

/* ═══════════════════════════════════════════════════════
   SECTION 8 — LESSONS
═══════════════════════════════════════════════════════ */
let editLessonId = null;

function renderLessons() {
  document.getElementById('lesson-editor').classList.add('hidden');
  document.getElementById('lessons-list-view').classList.remove('hidden');
  const list = document.getElementById('lessons-list');
  if (!S.lessons.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-ico">📖</div><div class="empty-title">No lessons yet</div><p>Create one or generate notes from a file using AI Explainer</p></div>';
    return;
  }
  list.innerHTML = S.lessons.map(l => `
    <div class="lesson-card" onclick="openLesson('${l.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div class="lesson-title">${l.title||'Untitled'}</div>
        <span class="tag tag-accent">${l.type||'Lesson'}</span>
      </div>
      <div class="lesson-preview">${l.body||'No content'}</div>
      <div class="lesson-meta"><span class="tag">${l.topic||'General'}</span><span>${l.date||''}</span></div>
    </div>`).join('');
}

function newLesson() {
  editLessonId = null;
  ['les-title','les-topic','les-body'].forEach(id => document.getElementById(id).value='');
  document.getElementById('les-type').value = 'lesson';
  document.getElementById('send-lesson-btn').classList.add('hidden');
  document.getElementById('lessons-list-view').classList.add('hidden');
  document.getElementById('lesson-editor').classList.remove('hidden');
}

function openLesson(id) {
  const l = S.lessons.find(x => x.id===id); if (!l) return;
  editLessonId = id;
  document.getElementById('les-title').value = l.title||'';
  document.getElementById('les-topic').value = l.topic||'';
  document.getElementById('les-body').value  = l.body||'';
  document.getElementById('les-type').value  = l.type||'lesson';
  document.getElementById('send-lesson-btn').classList.remove('hidden');
  document.getElementById('lessons-list-view').classList.add('hidden');
  document.getElementById('lesson-editor').classList.remove('hidden');
}

function saveLesson() {
  const t  = document.getElementById('les-title').value.trim()||'Untitled';
  const b  = document.getElementById('les-body').value.trim();
  const tp = document.getElementById('les-topic').value.trim()||'General';
  const ty = document.getElementById('les-type').value;
  const date = new Date().toLocaleDateString();
  if (editLessonId) {
    const i = S.lessons.findIndex(x => x.id===editLessonId);
    S.lessons[i] = { ...S.lessons[i], title:t, body:b, topic:tp, type:ty, date };
  } else {
    const nl = { id: Date.now().toString(), title:t, body:b, topic:tp, type:ty, date };
    S.lessons.push(nl);
    editLessonId = nl.id;
    document.getElementById('send-lesson-btn').classList.remove('hidden');
    logActivity(`📖 New lesson: ${t}`);
  }
  save(); toast('✅ Lesson saved!');
}

function deleteLesson() {
  if (!editLessonId || !confirm('Delete this lesson?')) return;
  S.lessons = S.lessons.filter(x => x.id!==editLessonId);
  save(); closeLesson();
}

function closeLesson() {
  stopSpeech();
  document.getElementById('lessons-list-view').classList.remove('hidden');
  document.getElementById('lesson-editor').classList.add('hidden');
  renderLessons();
}

/* ═══════════════════════════════════════════════════════
   SECTION 9 — FLASHCARDS + SM-2 SPACED REPETITION
   ─────────────────────────────────────────────────────
   SM-2 algorithm: the same one used by Anki.
   Cards you struggle with come back sooner.
   Cards you know well are spaced further apart.
   Grades: 1=Again, 2=Hard, 3=Good, 4=Easy
═══════════════════════════════════════════════════════ */
let deckFilter = 'all', fcEditId = null;
let studyCards = [], studyIdx = 0, studyAgain = [], sessionG = {again:0,hard:0,good:0,easy:0};

function sm2(card, grade) {
  const q = {1:1,2:3,3:4,4:5}[grade];
  let { interval=0, repetitions=0, easeFactor=2.5 } = card;
  if (q >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions++;
  } else { repetitions = 0; interval = 1; }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5-q)*(0.08+(5-q)*0.02));
  const next = new Date(); next.setDate(next.getDate() + interval);
  return { ...card, interval, repetitions, easeFactor: Math.round(easeFactor*100)/100, nextReview: next.toDateString() };
}

function getDueCards(cards) {
  const today = new Date(); today.setHours(0,0,0,0);
  return cards.filter(c => !c.nextReview || new Date(c.nextReview) <= today);
}

function renderFCList() {
  document.getElementById('fc-study-view').classList.add('hidden');
  document.getElementById('fc-list-view').classList.remove('hidden');
  const decks = [...new Set(S.flashcards.map(c => c.deck||'General'))];
  const due = getDueCards(S.flashcards);
  document.getElementById('fc-sub').textContent = `${S.flashcards.length} cards total · ${due.length} due today`;
  const banner = document.getElementById('fc-due-banner');
  if (due.length > 0) { banner.classList.remove('hidden'); document.getElementById('fc-due-text').textContent = `${due.length} card${due.length>1?'s':''} due for review today`; }
  else banner.classList.add('hidden');
  // Deck filter chips
  const chips = document.getElementById('fc-deck-chips');
  chips.innerHTML = [
    `<span class="tag" style="cursor:pointer;${deckFilter==='all'?'border-color:var(--accent);color:var(--accent);':''}" onclick="filterDeck('all')">All (${S.flashcards.length})</span>`,
    ...decks.map(d => {
      const dc = getDueCards(S.flashcards.filter(c=>(c.deck||'General')===d)).length;
      return `<span class="tag" style="cursor:pointer;${deckFilter===d?'border-color:var(--accent);color:var(--accent);':''}" onclick="filterDeck('${d}')">${d}${dc>0?` <span style="color:var(--red);font-size:10px;">(${dc}✦)</span>`:''}</span>`;
    })].join('');
  renderFCCards();
  document.getElementById('fc-all-study').innerHTML = S.flashcards.length ? '<button class="btn btn-secondary" onclick="startStudy(\'all\')">Study All Cards</button>' : '';
}

function filterDeck(d) { deckFilter = d; renderFCList(); }

function renderFCCards() {
  const cards = deckFilter==='all' ? S.flashcards : S.flashcards.filter(c=>(c.deck||'General')===deckFilter);
  const grid = document.getElementById('fc-grid');
  if (!cards.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-ico">🃏</div><div class="empty-title">No cards yet</div></div>'; return; }
  grid.innerHTML = cards.map(c => {
    const due = !c.nextReview || new Date(c.nextReview) <= new Date();
    return `<div style="background:var(--card);border:1.5px solid ${due?'var(--accent)':'var(--border)'};border-radius:13px;padding:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div style="flex:1;">
        <div style="font-weight:500;font-size:14px;margin-bottom:4px;">${c.question}</div>
        <div class="muted small">${c.answer}</div>
        <div style="margin-top:10px;display:flex;gap:7px;flex-wrap:wrap;align-items:center;">
          <span class="tag">${c.deck||'General'}</span>
          ${due?'<span class="tag tag-accent" style="font-size:10.5px;">Due Now</span>':`<span class="tag xsmall">Next: ${c.nextReview||'New'}</span>`}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-icon" onclick="editFC('${c.id}')">✏️</button>
        <button class="btn btn-icon" onclick="deleteFC('${c.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function startStudy(mode) {
  let cards = deckFilter==='all' ? S.flashcards : S.flashcards.filter(c=>(c.deck||'General')===deckFilter);
  if (mode==='due') cards = getDueCards(cards);
  if (!cards.length) { toast('No cards to study!'); return; }
  studyCards = [...cards].sort(()=>Math.random()-.5);
  studyAgain=[]; studyIdx=0; sessionG={again:0,hard:0,good:0,easy:0};
  document.getElementById('fc-list-view').classList.add('hidden');
  document.getElementById('fc-study-view').classList.remove('hidden');
  document.getElementById('fc-session-done').classList.add('hidden');
  document.getElementById('fc-scene').style.display='';
  showStudyCard();
}

function showStudyCard() {
  const c = studyCards[studyIdx];
  document.getElementById('fc-inner').classList.remove('flipped');
  document.getElementById('fc-front-txt').textContent = c.question;
  document.getElementById('fc-back-txt').textContent  = c.answer;
  document.getElementById('fc-prog').textContent = `Card ${studyIdx+1} of ${studyCards.length}${studyAgain.length?` (+${studyAgain.length} retry)`:''}`;
  document.getElementById('fc-grade-area').classList.add('hidden');
  document.getElementById('fc-flip-hint').classList.remove('hidden');
  stopSpeech();
}

function flipCard() {
  document.getElementById('fc-inner').classList.toggle('flipped');
  const flipped = document.getElementById('fc-inner').classList.contains('flipped');
  document.getElementById('fc-grade-area').classList.toggle('hidden', !flipped);
  document.getElementById('fc-flip-hint').classList.toggle('hidden', flipped);
}

function fcSpeak() {
  const flipped = document.getElementById('fc-inner').classList.contains('flipped');
  const c = studyCards[studyIdx]; if (!c) return;
  speak((flipped ? 'Answer: '+c.answer : 'Question: '+c.question), 'fc-tts');
}

function gradeCard(grade) {
  const map = {1:'again',2:'hard',3:'good',4:'easy'};
  sessionG[map[grade]]++;
  const c = studyCards[studyIdx];
  const updated = sm2(c, grade);
  const i = S.flashcards.findIndex(x => x.id===c.id);
  if (i>=0) S.flashcards[i] = updated;
  save();
  if (grade===1) studyAgain.push(updated);
  studyIdx++;
  if (studyIdx >= studyCards.length) {
    if (studyAgain.length > 0) { studyCards=[...studyAgain]; studyAgain=[]; studyIdx=0; showStudyCard(); }
    else finishSession();
  } else showStudyCard();
}

function finishSession() {
  const total = Object.values(sessionG).reduce((a,b)=>a+b,0);
  document.getElementById('fc-summary').innerHTML =
    `Reviewed <strong>${total}</strong> cards &nbsp;·&nbsp;
     <span style="color:var(--red)">Again: ${sessionG.again}</span> &nbsp;·&nbsp;
     <span style="color:#c07030">Hard: ${sessionG.hard}</span> &nbsp;·&nbsp;
     <span style="color:var(--blue)">Good: ${sessionG.good}</span> &nbsp;·&nbsp;
     <span style="color:var(--green)">Easy: ${sessionG.easy}</span>`;
  document.getElementById('fc-scene').style.display='none';
  document.getElementById('fc-session-done').classList.remove('hidden');
  document.getElementById('fc-grade-area').classList.add('hidden');
  document.getElementById('fc-flip-hint').classList.add('hidden');
  logActivity(`🃏 Studied ${total} flashcards`);
}

function exitStudy() {
  stopSpeech();
  document.getElementById('fc-scene').style.display='';
  document.getElementById('fc-study-view').classList.add('hidden');
  document.getElementById('fc-list-view').classList.remove('hidden');
  renderFCList();
}

function shuffleStudy() { studyCards.sort(()=>Math.random()-.5); studyIdx=0; showStudyCard(); }

function saveFC() {
  const q=document.getElementById('fc-m-q').value.trim(), a=document.getElementById('fc-m-a').value.trim(), d=document.getElementById('fc-m-deck').value.trim()||'General';
  if (!q||!a) { toast('Fill in both question and answer.'); return; }
  if (fcEditId) { const i=S.flashcards.findIndex(c=>c.id===fcEditId); S.flashcards[i]={...S.flashcards[i],question:q,answer:a,deck:d}; fcEditId=null; }
  else { S.flashcards.push({id:Date.now().toString(),deck:d,question:q,answer:a}); logActivity(`🃏 New card in ${d}`); }
  save(); closeModal('fc-add-modal');
  ['fc-m-q','fc-m-a','fc-m-deck'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fc-modal-ttl').textContent='Add Flashcard';
  renderFCList();
}

function editFC(id) {
  const c=S.flashcards.find(x=>x.id===id); if(!c)return;
  fcEditId=id;
  document.getElementById('fc-m-q').value=c.question;
  document.getElementById('fc-m-a').value=c.answer;
  document.getElementById('fc-m-deck').value=c.deck||'';
  document.getElementById('fc-modal-ttl').textContent='Edit Flashcard';
  openModal('fc-add-modal');
}

function deleteFC(id) { if(!confirm('Delete this card?'))return; S.flashcards=S.flashcards.filter(c=>c.id!==id); save(); renderFCList(); }

/* AI Generate Flashcards */
let fcAIFiles = [];
function handleFCFile(e) { fcAIFiles=[...e.target.files]; document.getElementById('fcai-chips').innerHTML=fcAIFiles.map((f,i)=>`<div class="file-chip">${fileIcon(f.type)} ${f.name}<button onclick="fcAIFiles.splice(${i},1);document.getElementById('fcai-chips').innerHTML=''">✕</button></div>`).join(''); }

async function aiGenFC() {
  const deck=document.getElementById('fc-ai-deck').value.trim()||'AI Generated';
  const count=parseInt(document.getElementById('fc-ai-cnt').value)||10;
  const src=document.getElementById('fc-ai-src').value.trim();
  if(!src&&!fcAIFiles.length){toast('Add text or upload a file.');return;}
  const st=document.getElementById('fc-ai-status');
  st.innerHTML='<div class="dots"><span></span><span></span><span></span></div> Generating flashcards...';
  st.classList.remove('hidden'); st.style.color='var(--text2)';
  try {
    const text = await buildTextContent(src, fcAIFiles);
    const prompt = `You are a medical educator creating study flashcards. Generate exactly ${count} high-quality flashcards from the content below.

Rules:
- Questions should test UNDERSTANDING, not just memorization
- Include "why", "how", and clinical application questions
- Keep answers concise but complete
- Respond ONLY with a JSON array, no other text:
[{"question":"...","answer":"..."}]

Content:
${text}`;
    const result = await callDeepSeek(prompt);
    const cards = JSON.parse(result.replace(/```json|```/g,'').trim());
    cards.forEach(c => S.flashcards.push({id:Date.now().toString()+Math.random().toString(36).slice(2), deck, question:c.question, answer:c.answer}));
    save(); renderFCList(); closeModal('fc-ai-modal');
    toast(`✅ Generated ${cards.length} flashcards in "${deck}"!`);
    logActivity(`🤖 AI generated ${cards.length} flashcards for ${deck}`);
  } catch(e) { st.textContent='❌ '+e.message; st.style.color='var(--red)'; }
}

/* ═══════════════════════════════════════════════════════
   SECTION 10 — QUIZ
═══════════════════════════════════════════════════════ */
let QD = { questions:[], idx:0, score:0, pool:[], type:'mc', topic:'' };
let currentQ = '';
let quizFiles = [];

function setupQuiz() {
  ['quiz-running','quiz-done'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('quiz-setup').classList.remove('hidden');
  const decks = [...new Set(S.flashcards.map(c=>c.deck||'General'))];
  document.getElementById('q-topic').innerHTML = '<option value="all">All Topics</option>' + decks.map(d=>`<option value="${d}">${d}</option>`).join('');
}

function startQuiz() {
  const topic=document.getElementById('q-topic').value, count=parseInt(document.getElementById('q-count').value)||10, type=document.getElementById('q-type').value;
  const pool = topic==='all' ? S.flashcards : S.flashcards.filter(c=>(c.deck||'General')===topic);
  if (pool.length < (type==='mc'?4:1)) { document.getElementById('q-err').classList.remove('hidden'); return; }
  document.getElementById('q-err').classList.add('hidden');
  QD = { questions:[...pool].sort(()=>Math.random()-.5).slice(0,Math.min(count,pool.length)), idx:0, score:0, pool, type, topic };
  showQSection('running'); showQ();
}

function showQ() {
  const q=QD.questions[QD.idx], tot=QD.questions.length;
  document.getElementById('qr-num').textContent=QD.idx+1;
  document.getElementById('qr-tot').textContent=tot;
  document.getElementById('qr-score').textContent=QD.score;
  document.getElementById('qr-bar').style.width=(QD.idx/tot*100)+'%';
  document.getElementById('qr-question').textContent=q.question; currentQ=q.question;
  document.getElementById('qr-feedback').classList.add('hidden');
  document.getElementById('qr-next').classList.add('hidden');
  stopSpeech();
  if (QD.type==='mc') {
    document.getElementById('qr-written').classList.add('hidden');
    const others=QD.pool.filter(c=>c.id!==q.id).sort(()=>Math.random()-.5).slice(0,3);
    document.getElementById('qr-options').innerHTML=[q,...others].sort(()=>Math.random()-.5).map(c=>`<button class="q-opt" onclick="checkMC(this,'${c.id}','${q.id}')">${c.answer}</button>`).join('');
  } else {
    document.getElementById('qr-options').innerHTML='';
    document.getElementById('qr-written').classList.remove('hidden');
    document.getElementById('qr-wans').value='';
    const cb=document.querySelector('#qr-written .btn'); if(cb)cb.disabled=false;
  }
}

function checkMC(el, chosen, correct) {
  document.querySelectorAll('.q-opt').forEach(o=>o.classList.add('disabled'));
  const fb=document.getElementById('qr-feedback'), q=QD.questions[QD.idx];
  if (chosen===correct) { el.classList.add('correct'); QD.score++; document.getElementById('qr-score').textContent=QD.score; fb.className='q-feedback ok'; fb.textContent='✅ Correct!'; }
  else { el.classList.add('wrong'); fb.className='q-feedback bad'; fb.textContent='❌ Correct answer: '+q.answer; document.querySelectorAll('.q-opt').forEach(o=>{if(o.textContent.trim()===q.answer)o.classList.add('correct');}); }
  fb.classList.remove('hidden'); document.getElementById('qr-next').classList.remove('hidden');
}

function checkWritten() {
  const given=document.getElementById('qr-wans').value.trim().toLowerCase();
  const correct=QD.questions[QD.idx].answer.toLowerCase();
  const match=correct.includes(given)||given.includes(correct.substring(0,Math.max(3,Math.floor(correct.length*.4))));
  const fb=document.getElementById('qr-feedback');
  if(match){QD.score++;document.getElementById('qr-score').textContent=QD.score;fb.className='q-feedback ok';fb.textContent='✅ Correct!';}
  else{fb.className='q-feedback bad';fb.textContent='❌ Answer: '+QD.questions[QD.idx].answer;}
  fb.classList.remove('hidden'); document.getElementById('qr-next').classList.remove('hidden');
  const cb=document.querySelector('#qr-written .btn'); if(cb)cb.disabled=true;
}

function nextQ() { QD.idx++; if(QD.idx>=QD.questions.length) endQuiz(); else showQ(); }

async function endQuiz() {
  const s=QD.score, t=QD.questions.length, pct=Math.round(s/t*100);
  showQSection('done');
  document.getElementById('done-score').textContent=`${s}/${t}`;
  document.getElementById('done-grade').textContent=(pct>=90?'🏆 Excellent!':pct>=75?'👍 Good job!':pct>=50?'📚 Keep studying!':'💪 Keep going!')+` — ${pct}%`;
  const record={score:s,total:t,pct,topic:QD.topic==='all'?'All':QD.topic,date:new Date().toLocaleDateString()};
  S.quizHistory.push(record); logActivity(`📝 Quiz: ${s}/${t} on ${record.topic}`); save();
  // Upload to Supabase for admin view
  await dbInsert('quiz_progress', { profile_name: S.profile.name, ...record, created_at: new Date().toISOString() });
}

function retakeQuiz() { showQSection('setup'); startQuiz(); }
function showQSection(s) { ['quiz-setup','quiz-running','quiz-done'].forEach(id=>document.getElementById(id).classList.toggle('hidden', !id.endsWith(s))); }

function handleQFile(e) { quizFiles=[...e.target.files]; document.getElementById('qf-chips').innerHTML=quizFiles.map(f=>`<div class="file-chip">${fileIcon(f.type)} ${f.name}</div>`).join(''); }

async function aiGenerateQuiz() {
  const src=document.getElementById('ai-q-src').value.trim(), count=parseInt(document.getElementById('ai-q-count').value)||6, diff=document.getElementById('ai-q-diff').value;
  if(!src&&!quizFiles.length){toast('Add text or a file.');return;}
  const st=document.getElementById('ai-q-status');
  st.innerHTML='<div class="dots"><span></span><span></span><span></span></div> Generating quiz...';
  st.classList.remove('hidden'); st.style.color='var(--text2)';
  try {
    const text = await buildTextContent(src, quizFiles);
    const prompt = `You are a medical educator. Generate ${count} ${diff} multiple-choice quiz questions from the content below.

Rules:
- Questions must require THINKING and CLINICAL REASONING, not just recalling text
- Test application, not just memorization
- Respond ONLY with a JSON array, no other text:
[{"question":"...","answer":"correct answer","wrong1":"...","wrong2":"...","wrong3":"..."}]

Content:
${text}`;
    const result = await callDeepSeek(prompt);
    const qs = JSON.parse(result.replace(/```json|```/g,'').trim());
    const deck = 'AI Quiz — '+new Date().toLocaleDateString();
    qs.forEach(q => S.flashcards.push({id:Date.now().toString()+Math.random().toString(36).slice(2), deck, question:q.question, answer:q.answer}));
    save(); setupQuiz();
    st.textContent=`✅ ${qs.length} questions ready! Select "${deck}" from the topic dropdown.`; st.style.color='var(--green)';
    logActivity(`🤖 AI generated ${qs.length}-question quiz`);
  } catch(e) { st.textContent='❌ '+e.message; st.style.color='var(--red)'; }
}

/* ═══════════════════════════════════════════════════════
   SECTION 11 — PRESENTATIONS
═══════════════════════════════════════════════════════ */
let editPresId=null, presIdx=0, presData=null;

function renderPresList() {
  ['pres-editor','pres-player'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('pres-list').style.display='';
  const el=document.getElementById('pres-items');
  if(!S.presentations.length){el.innerHTML='<div class="empty-state"><div class="empty-ico">🎬</div><div class="empty-title">No presentations yet</div></div>';return;}
  el.innerHTML=S.presentations.map(p=>`
    <div style="background:var(--card);border:1px solid var(--border);border-radius:13px;padding:18px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-family:var(--df);font-size:18px;font-weight:700;">${p.title||'Untitled'}</div><div class="muted small mt4">${p.slides.length} slide(s) · ${p.date||''}</div></div>
      <div class="row" style="gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="playPres('${p.id}')">▶ Play</button>
        <button class="btn btn-icon" onclick="editPres('${p.id}')">✏️</button>
        <button class="btn btn-icon" onclick="deletePres('${p.id}')">🗑</button>
      </div>
    </div>`).join('');
}

function newPres(){editPresId=null;document.getElementById('pres-title').value='';document.getElementById('pres-slides-ed').innerHTML='';document.getElementById('pres-list').style.display='none';document.getElementById('pres-editor').classList.remove('hidden');addSlide();}
function editPres(id){const p=S.presentations.find(x=>x.id===id);if(!p)return;editPresId=id;document.getElementById('pres-title').value=p.title||'';document.getElementById('pres-slides-ed').innerHTML='';p.slides.forEach(s=>addSlide(s));document.getElementById('pres-list').style.display='none';document.getElementById('pres-editor').classList.remove('hidden');}
function addSlide(data=null){const el=document.createElement('div');el.className='card mb12';el.innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:12px;"><div class="bold small">Slide</div><button class="btn btn-red btn-xs" onclick="this.closest('.card').remove()">✕ Remove</button></div><div class="form-group"><label>Slide Text (read aloud in presentation)</label><textarea class="sl-txt" style="min-height:80px;">${data?data.text||'':''}</textarea></div><div class="form-group"><label>Image URL (optional)</label><input class="sl-img" value="${data?data.img||'':''}" placeholder="https://..."></div>`;document.getElementById('pres-slides-ed').appendChild(el);}
function savePres(){const title=document.getElementById('pres-title').value.trim()||'Untitled';const slides=[...document.querySelectorAll('#pres-slides-ed .card')].map(el=>({text:el.querySelector('.sl-txt').value||'',img:el.querySelector('.sl-img').value||''}));if(!slides.length){toast('Add at least one slide.');return;}if(editPresId){const i=S.presentations.findIndex(x=>x.id===editPresId);S.presentations[i]={...S.presentations[i],title,slides,date:new Date().toLocaleDateString()};}else{S.presentations.push({id:Date.now().toString(),title,slides,date:new Date().toLocaleDateString()});logActivity(`🎬 New presentation: ${title}`);}save();closePres();}
function closePres(){stopSpeech();document.getElementById('pres-editor').classList.add('hidden');document.getElementById('pres-list').style.display='';renderPresList();}
function deletePresEdit(){if(!editPresId||!confirm('Delete?'))return;S.presentations=S.presentations.filter(x=>x.id!==editPresId);save();closePres();}
function deletePres(id){if(!confirm('Delete?'))return;S.presentations=S.presentations.filter(x=>x.id!==id);save();renderPresList();}
function playPres(id){presData=S.presentations.find(x=>x.id===id);if(!presData)return;presIdx=0;document.getElementById('pres-list').style.display='none';document.getElementById('pres-player').classList.remove('hidden');document.getElementById('pres-pl-title').textContent=presData.title;showPresSlide();}
function showPresSlide(){const s=presData.slides[presIdx];document.getElementById('pres-pl-counter').textContent=`${presIdx+1} / ${presData.slides.length}`;document.getElementById('pres-pl-txt').textContent=s.text||'';const img=document.getElementById('pres-pl-img');if(s.img){img.src=s.img;img.classList.remove('hidden');}else img.classList.add('hidden');stopSpeech();}
function presNav(d){presIdx=Math.max(0,Math.min(presData.slides.length-1,presIdx+d));showPresSlide();}
function stopPresPlay(){stopSpeech();document.getElementById('pres-player').classList.add('hidden');document.getElementById('pres-list').style.display='';}

/* ═══════════════════════════════════════════════════════
   SECTION 12 — AI EXPLAINER (Google Gemini — free)
   ─────────────────────────────────────────────────────
   callDeepSeek(prompt) sends a request to the DeepSeek
   API and returns the response text.
   buildTextContent() extracts text from uploaded files.
═══════════════════════════════════════════════════════ */
async function callDeepSeek(prompt) {
  // Using Groq free API — fast and works in Nigeria
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7
    })
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('AI error: ' + err);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

/* File handling */
let aiFiles = [];
function handleAIDrop(e){e.preventDefault();document.getElementById('ai-drop').classList.remove('drag-over');addAIFiles([...e.dataTransfer.files]);}
function handleAIFiles(e){addAIFiles([...e.target.files]);}
function addAIFiles(files){aiFiles=[...aiFiles,...files];renderAIChips();}
function removeAIFile(i){aiFiles.splice(i,1);renderAIChips();}
function renderAIChips(){document.getElementById('ai-file-chips').innerHTML=aiFiles.map((f,i)=>`<div class="file-chip">${fileIcon(f.type)} ${f.name}<button onclick="removeAIFile(${i})">✕</button></div>`).join('');}
function fileIcon(t){if(t.startsWith('image/'))return'🖼️';if(t==='application/pdf')return'📄';if(t.includes('word'))return'📝';if(t.includes('presentation'))return'📊';return'📎';}

async function extractDocx(file){const ab=await file.arrayBuffer();const r=await mammoth.extractRawText({arrayBuffer:ab});return r.value;}
async function extractPptx(file){const zip=await JSZip.loadAsync(file);let txt='';const sf=Object.keys(zip.files).filter(f=>f.match(/ppt\/slides\/slide\d+\.xml/)).sort();for(const s of sf){const xml=await zip.files[s].async('string');const m=xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g)||[];txt+=m.map(x=>x.replace(/<[^>]+>/g,'')).join(' ')+'\n\n';}return txt.trim()||'Could not extract text.';}
function fileToText(file){return new Promise((r,j)=>{const rd=new FileReader();rd.onload=()=>r(rd.result);rd.onerror=j;rd.readAsText(file);});}

async function buildTextContent(textInput, files=[]) {
  const parts = [];
  if (textInput) parts.push(textInput);
  for (const file of files) {
    try {
      if (file.type.includes('wordprocessingml')||file.name.endsWith('.docx')) parts.push(`[From ${file.name}]:\n`+await extractDocx(file));
      else if (file.type.includes('presentationml')||file.name.endsWith('.pptx')) parts.push(`[From ${file.name}]:\n`+await extractPptx(file));
      else if (file.type.startsWith('text/')) parts.push(`[From ${file.name}]:\n`+await fileToText(file));
      else if (file.type.startsWith('image/')) parts.push(`[Image file attached: ${file.name} — please describe or analyze based on filename and context]`);
      else if (file.type==='application/pdf') parts.push(`[PDF attached: ${file.name} — please analyze this document's content]`);
    } catch(e){ console.warn('File error:', file.name); }
  }
  if (!parts.length) throw new Error('No content to process.');
  return parts.join('\n\n');
}

const AI_PROMPTS = {
  explain:    (ctx,t) => `You are an expert medical educator. Explain this content${ctx?` about "${ctx}"`:''}  clearly and simply for a medical laboratory science student. Use analogies and real examples. Break down complex terms step by step.\n\nContent:\n${t}`,
  summarize:  (ctx,t) => `Summarize this medical content${ctx?` about "${ctx}"`:''}. Create clear, organized bullet points covering the most important facts. Group related points together.\n\nContent:\n${t}`,
  keypoints:  (ctx,t) => `List and explain the KEY POINTS from this content${ctx?` about "${ctx}"`:''} that a student must know. Number each point (1, 2, 3...) and give a 2-3 sentence explanation for each.\n\nContent:\n${t}`,
  flashcards: (ctx,t) => `Generate 10 study flashcards from this content${ctx?` about "${ctx}"`:''} formatted as:\n1. Q: [question testing understanding]\n   A: [clear concise answer]\n\nMake questions test deep understanding, not just recall.\n\nContent:\n${t}`
};

async function runAI(mode) {
  const textInput=document.getElementById('ai-text').value.trim(), ctx=document.getElementById('ai-ctx').value.trim();
  if(!textInput&&!aiFiles.length){toast('Add text or upload a file first.');return;}
  const out=document.getElementById('ai-out');
  out.innerHTML='<div class="dots"><span></span><span></span><span></span></div>';
  out.classList.remove('italic','muted');
  stopSpeech();
  try {
    const content = await buildTextContent(textInput, aiFiles);
    const result  = await callDeepSeek(AI_PROMPTS[mode](ctx, content));
    out.textContent = result;
  } catch(e) { out.textContent = '❌ '+e.message; out.classList.add('muted'); }
}

function saveAIAsLesson() {
  const text=document.getElementById('ai-out').textContent;
  if(!text||text.includes('appear here')){toast('Generate content first.');return;}
  const title='AI: '+(document.getElementById('ai-ctx').value||new Date().toLocaleDateString());
  S.lessons.push({id:Date.now().toString(),title,body:text,topic:document.getElementById('ai-ctx').value||'AI',type:'guide',date:new Date().toLocaleDateString()});
  save(); toast('✅ Saved as lesson!'); logActivity(`🤖 AI explanation saved as lesson`);
}

function copyAI() { navigator.clipboard.writeText(document.getElementById('ai-out').textContent).then(()=>toast('📋 Copied!')); }

/* ═══════════════════════════════════════════════════════
   SECTION 13 — INBOX & SHARING (via Supabase)
   ─────────────────────────────────────────────────────
   Content is sent to the "inbox" table in Supabase.
   Recipient_name is used to filter what each profile sees.
═══════════════════════════════════════════════════════ */
let pendingSend = null;

function openSendModal(type) {
  const from = S.profile?.name;
  if (type==='lesson') {
    if(!editLessonId){toast('Save the lesson first.');return;}
    const l=S.lessons.find(x=>x.id===editLessonId);
    if(!l)return;
    pendingSend={type:'lesson',data:l,label:`📖 Lesson: "${l.title}"`,from};
  } else if (type==='flashcards') {
    const deck=deckFilter==='all'?'All':deckFilter;
    const cards=deckFilter==='all'?S.flashcards:S.flashcards.filter(c=>(c.deck||'General')===deckFilter);
    if(!cards.length){toast('No cards in this deck.');return;}
    pendingSend={type:'flashcards',data:cards,label:`🃏 Flashcard deck: "${deck}" (${cards.length} cards)`,from};
  } else if (type==='quiz') {
    const src=document.getElementById('ai-q-src').value.trim();
    if(!src){toast('Generate a quiz first.');return;}
    pendingSend={type:'lesson',data:{id:Date.now().toString(),title:'Shared Quiz — '+new Date().toLocaleDateString(),body:src,topic:'Quiz',type:'guide',date:new Date().toLocaleDateString()},label:'📝 AI Quiz Content',from};
  } else if (type==='ai') {
    const text=document.getElementById('ai-out').textContent;
    if(!text||text.includes('appear here')){toast('Generate AI content first.');return;}
    pendingSend={type:'lesson',data:{id:Date.now().toString(),title:'Shared: '+(document.getElementById('ai-ctx').value||'AI Content'),body:text,topic:document.getElementById('ai-ctx').value||'General',type:'guide',date:new Date().toLocaleDateString()},label:'🤖 AI Explanation',from};
  } else if (type==='presentation') {
    if(!editPresId){toast('Save the presentation first.');return;}
    const p=S.presentations.find(x=>x.id===editPresId);
    if(!p)return;
    pendingSend={type:'presentation',data:p,label:`🎬 Presentation: "${p.title}"`,from};
  }
  if(!pendingSend)return;
  document.getElementById('send-preview').textContent=pendingSend.label;
  document.getElementById('send-to').value='';
  document.getElementById('send-status').classList.add('hidden');
  openModal('send-modal');
}

async function executeSend() {
  const to = document.getElementById('send-to').value.trim();
  if(!to){toast('Enter a recipient name.');return;}
  if(!pendingSend)return;
  const st=document.getElementById('send-status');
  st.innerHTML='<div class="dots"><span></span><span></span><span></span></div> Sending...';
  st.classList.remove('hidden'); st.style.color='var(--text2)';
  const ok = await dbInsert('inbox', {
    recipient_name: to,
    sender_name: pendingSend.from,
    content_type: pendingSend.type,
    label: pendingSend.label,
    payload: JSON.stringify(pendingSend.data),
    created_at: new Date().toISOString(),
    is_read: false
  });
  if(ok){
    st.textContent=`✅ Sent to ${to}!`; st.style.color='var(--green)';
    logActivity(`📤 Sent ${pendingSend.type} to ${to}`);
  } else {
    st.innerHTML='❌ Could not send. Make sure your Supabase tables are set up (see setup guide below).<br><br><strong>Quick fix:</strong> Go to your Supabase dashboard → SQL Editor → run the setup SQL provided in the README.';
    st.style.color='var(--red)';
  }
}

async function loadInbox() {
  const myName = S.profile?.name; if(!myName)return;
  const rows = await dbSelect('inbox', `recipient_name=eq.${encodeURIComponent(myName)}&order=created_at.desc`);
  if(rows.length) {
    rows.forEach(row => {
      if(!S.inbox.find(x=>x.id===row.id)) {
        S.inbox.push({
          id: row.id,
          type: row.content_type,
          label: row.label,
          from: row.sender_name,
          data: JSON.parse(row.payload||'null'),
          timestamp: new Date(row.created_at).getTime()
        });
      }
    });
    save();
  }
  renderInbox();
  const unread=S.inbox.filter(x=>!x.accepted&&!x.declined).length;
  const badge=document.getElementById('inbox-badge');
  if(unread>0){badge.textContent=unread;badge.classList.remove('hidden');}else badge.classList.add('hidden');
}

function renderInbox() {
  const list=document.getElementById('inbox-list');
  if(!S.inbox.length){list.innerHTML='<div class="empty-state"><div class="empty-ico">📬</div><div class="empty-title">Inbox is empty</div><p>Content sent to you will appear here</p></div>';return;}
  list.innerHTML=S.inbox.slice().reverse().map(item=>`
    <div class="inbox-item ${!item.accepted&&!item.declined?'unread':''}">
      <div style="flex:1;">
        <div class="bold">${item.label||item.type}</div>
        <div class="inbox-sender">From: <strong>${item.from}</strong> · ${new Date(item.timestamp).toLocaleDateString()}</div>
        ${item.accepted?'<span class="tag tag-green mt8">✅ Imported</span>':item.declined?'<span class="tag tag-red mt8">Declined</span>':''}
      </div>
      ${!item.accepted&&!item.declined?`
        <div class="row" style="flex-shrink:0;">
          <button class="btn btn-green btn-sm" onclick="acceptItem('${item.id}')">✅ Import</button>
          <button class="btn btn-red btn-sm" onclick="declineItem('${item.id}')">✕</button>
        </div>`:''}
    </div>`).join('');
}

function acceptItem(id) {
  const item=S.inbox.find(x=>x.id===id); if(!item)return;
  if(item.type==='lesson'&&item.data){item.data.id=Date.now().toString();S.lessons.push(item.data);toast('✅ Lesson imported!');}
  else if(item.type==='flashcards'&&item.data){item.data.forEach(c=>{c.id=Date.now().toString()+Math.random();S.flashcards.push(c);});toast(`✅ ${item.data.length} flashcards imported!`);}
  else if(item.type==='presentation'&&item.data){item.data.id=Date.now().toString();S.presentations.push(item.data);toast('✅ Presentation imported!');}
  item.accepted=true; logActivity(`📬 Imported ${item.type} from ${item.from}`); save(); renderInbox();
}

function declineItem(id) { const item=S.inbox.find(x=>x.id===id); if(item){item.declined=true;save();renderInbox();} }

/* ═══════════════════════════════════════════════════════
   SECTION 14 — PROGRESS
   Admin (E_mathesis) sees all profiles via Supabase.
═══════════════════════════════════════════════════════ */
async function renderProgress() {
  const hist=S.quizHistory;
  document.getElementById('prog-total').textContent=hist.length;
  const avg=hist.length?Math.round(hist.reduce((a,h)=>a+h.pct,0)/hist.length)+'%':'—';
  document.getElementById('prog-avg').textContent=avg;
  if(!hist.length){
    document.getElementById('prog-topics').innerHTML='<div class="empty-state" style="padding:20px 0"><div class="empty-ico" style="font-size:30px;">📈</div><p>Take quizzes to see results</p></div>';
    document.getElementById('prog-history').innerHTML='<div class="empty-state" style="padding:20px 0"><div class="empty-ico" style="font-size:30px;">📋</div><p>No quiz history yet</p></div>';
  } else {
    const topics={};
    hist.forEach(h=>{if(!topics[h.topic])topics[h.topic]={t:0,n:0};topics[h.topic].t+=h.pct;topics[h.topic].n++;});
    document.getElementById('prog-topics').innerHTML=Object.entries(topics).map(([t,d])=>{const p=Math.round(d.t/d.n);return`<div style="margin-bottom:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="bold small">${t}</span><span class="muted small">${p}%</span></div><div class="prog-bar"><div class="prog-fill" style="width:${p}%"></div></div></div>`;}).join('');
    document.getElementById('prog-history').innerHTML=hist.slice().reverse().map(h=>`<div style="display:flex;justify-content:space-between;padding:10px 13px;background:var(--bg2);border-radius:9px;margin-bottom:7px;font-size:13px;"><span><strong>${h.topic}</strong> · ${h.date}</span><span style="font-weight:600;color:var(--accent);">${h.score}/${h.total} (${h.pct}%)</span></div>`).join('');
  }
  if(isAdmin()){
    document.getElementById('admin-section').classList.remove('hidden');
    const el=document.getElementById('admin-profiles');
    el.innerHTML='<div class="muted small">Loading all profiles...</div>';
    const rows=await dbSelect('quiz_progress','order=created_at.desc');
    if(!rows.length){el.innerHTML='<div class="muted small">No quiz data from other profiles yet.</div>';return;}
    const byProfile={};
    rows.forEach(r=>{if(!byProfile[r.profile_name])byProfile[r.profile_name]=[];byProfile[r.profile_name].push(r);});
    el.innerHTML=Object.entries(byProfile).map(([name,records])=>{
      const avg=Math.round(records.reduce((a,r)=>a+r.pct,0)/records.length);
      return`<div class="card mb12"><div class="bold mb12" style="font-family:var(--df);font-size:17px;">${name} <span class="tag tag-blue">${records.length} quizzes · Avg: ${avg}%</span></div>${records.slice(0,5).map(r=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid var(--border);"><span>${r.topic} · ${r.date}</span><span style="font-weight:600;color:var(--accent);">${r.score}/${r.total} (${r.pct}%)</span></div>`).join('')}</div>`;
    }).join('');
  }
}

/* ═══════════════════════════════════════════════════════
   SECTION 15 — INITIALIZATION
═══════════════════════════════════════════════════════ */
function init() {
  loadLocal();
  applyTheme();

  // Sample flashcards on first ever open
  if (!S.flashcards.length) {
    S.flashcards = [
      {id:'1',deck:'Hematology',question:'Normal hemoglobin range for adult males?',answer:'13.5 – 17.5 g/dL'},
      {id:'2',deck:'Hematology',question:'What causes megaloblastic anemia?',answer:'Vitamin B12 or folate deficiency — prevents proper DNA synthesis in developing red blood cells'},
      {id:'3',deck:'Hematology',question:'Why specifically does B12 deficiency cause megaloblastic anemia?',answer:'B12 is required for thymidine synthesis (DNA building block). Without it, RBCs cannot divide properly and become abnormally large (megaloblasts)'},
      {id:'4',deck:'Microbiology',question:'Principle behind the Gram stain?',answer:'Crystal violet + iodine form a complex. Gram+ cells retain it (thick peptidoglycan wall). Gram− cells decolorize and stain pink with safranin'},
      {id:'5',deck:'Microbiology',question:'Causative agent of tuberculosis and why is it acid-fast?',answer:'Mycobacterium tuberculosis. Acid-fast because its waxy mycolic acid cell wall resists decolorization by acid-alcohol in the Ziehl-Neelsen stain'},
      {id:'6',deck:'Clinical Chemistry',question:'Normal fasting blood glucose range?',answer:'70 – 100 mg/dL (3.9 – 5.6 mmol/L)'},
      {id:'7',deck:'Clinical Chemistry',question:'Why is troponin preferred over CK-MB for MI diagnosis?',answer:'More cardiac-specific, detects smaller infarcts, remains elevated 7–14 days (vs 3 days for CK-MB), and has higher sensitivity in early MI'},
    ];
    save();
  }

  // Check if already logged in
  if (S.profile?.name && PROFILES[S.profile.name]) {
    launchApp();
  } else {
    S.profile = null;
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').classList.add('hidden');
    document.getElementById('l-pwd').addEventListener('keydown', e => { if(e.key==='Enter') login(); });
    document.getElementById('s-pwd2').addEventListener('keydown', e => { if(e.key==='Enter') signup(); });
  }
}

init();
