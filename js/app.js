import {
  auth,
  db,
  signInAnonymously,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "./firebase-config.js";

// ============================================================================
// CONSTANTES & DEFAULTS
// ============================================================================
const DEFAULT_AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4f46e5"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#g)"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-weight="900" font-size="72">CV</text>
  </svg>`
);

const DEFAULT_COVER = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="260" viewBox="0 0 800 260">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0a1026"/><stop offset="55%" stop-color="#312e81"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs>
    <rect width="800" height="260" fill="url(#bg)"/>
    <circle cx="680" cy="50" r="140" fill="#06b6d4" opacity="0.16"/>
    <circle cx="140" cy="230" r="160" fill="#818cf8" opacity="0.14"/>
  </svg>`
);

const RING_COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#e11d48", "#06b6d4", "#8b5cf6", "#0f172a", "#ec4899"];
const PROFILE_EMOJIS = ["🚀", "🔥", "🚚", "🏆", "⚡", "👏", "❤️", "😎", "💼", "🎯"];

const ALL_CATEGORIES = [
  { id: "all", label: "✨ Todos os Posts" },
  { id: "featured", label: "⭐ Destaques" },
  { id: "Trabalho", label: "💼 Trabalho" },
  { id: "Fornecedores", label: "🚚 Fornecedores" },
  { id: "Negócios", label: "📈 Negócios" },
  { id: "Diversão", label: "🎉 Diversão" }
];

const SUPPLIER_ALLOWED_CATS = ["all", "featured", "Fornecedores", "Negócios", "Diversão"];

const FALLBACK_HEADLINES = [
  { title: "Setor de logística e transporte rodoviário registra alta na movimentação de cargas expressas no Brasil", source: "G1 Economia", url: "https://g1.globo.com/economia/" },
  { title: "Operações de última milha ampliam investimentos em rastreamento em tempo real e hubs regionais", source: "UOL Economia", url: "https://economia.uol.com.br/" },
  { title: "E-commerce brasileiro mantém ritmo acelerado e impulsiona demanda por transportadoras parceiras", source: "G1 Tecnologia", url: "https://g1.globo.com/tecnologia/" },
  { title: "Corredores logísticos de São Paulo recebem novos sistemas digitais de triagem e conferência de docas", source: "G1 Brasil", url: "https://g1.globo.com/brasil/" }
];

// ============================================================================
// ESTADO GLOBAL
// ============================================================================
let currentUser = null;
let allPosts = [];
let whitelistEntries = [];
let activeCategory = "all";
let searchQuery = "";
let authorFilterPhone = null;

let draftImageBase64 = null;
let draftVideoBase64 = null;
let draftMusicTrack = null;

// Rádio Contínua
const audioPlayer = new Audio();
let radioQueue = [];
let activeMusicBtn = null;

// Observer para parar a música quando o post sai da tela
const musicObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting && entry.target === activeMusicBtn && !audioPlayer.paused) {
      audioPlayer.pause();
    }
  });
}, { threshold: 0.05 });
let radioIndex = 0;
let radioContinuous = true;

// RSS Ticker
let rssHeadlines = [...FALLBACK_HEADLINES];
let rssIndex = 0;
let rssPaused = false;

// ============================================================================
// UTILITÁRIOS
// ============================================================================
const sanitizeDigits = (str) => String(str || "").replace(/\D/g, "");

function normalizeBrPhone(raw) {
  const digits = sanitizeDigits(raw);
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

function formatPhoneDisplay(phoneDigits) {
  const d = sanitizeDigits(phoneDigits).replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phoneDigits;
}

function formatRichText(raw) {
  const escaped = String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/==(.+?)==/g, '<mark class="bg-amber-200 text-slate-950 font-bold px-1.5 py-0.5 rounded-md">$1</mark>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-extrabold text-slate-900">$1</strong>')
    .replace(/_(.+?)_/g, '<em class="italic">$1</em>')
    .replace(/^•\s(.+)$/gm, '<span class="block pl-3 border-l-2 border-indigo-400 my-0.5">$1</span>')
    .replace(/\n/g, "<br />");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compressImageFile(file, maxWidth = 960, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// PORTARIA EXCLUSIVA POR CELULAR (FIREBASE AUTH + WHITELIST)
// ============================================================================
async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

async function initGate() {
  await ensureAuth();
  const savedPhone = localStorage.getItem("cv_logged_phone");
  const snap = await getDocs(collection(db, "whitelist"));
  whitelistEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (whitelistEntries.length === 0) {
    document.getElementById("gateBootstrapNotice").classList.remove("hidden");
    document.getElementById("gateNameGroup").classList.remove("hidden");
  }

  if (savedPhone) {
    const found = whitelistEntries.find((w) => w.id === savedPhone && w.active !== false);
    if (found) {
      await completeLogin(found);
      return;
    }
  }

  document.getElementById("gateScreen").classList.remove("hidden");
}

document.getElementById("gatePhoneInput").addEventListener("input", (e) => {
  let v = sanitizeDigits(e.target.value).slice(0, 11);
  if (v.length > 6) {
    e.target.value = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  } else if (v.length > 2) {
    e.target.value = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  } else {
    e.target.value = v;
  }
});

document.getElementById("gateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("gateErrorBox");
  errBox.classList.add("hidden");

  const phoneNorm = normalizeBrPhone(document.getElementById("gatePhoneInput").value);

  if (phoneNorm.length < 12) {
    errBox.textContent = "Informe um número de celular válido com DDD.";
    errBox.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("gateSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Verificando Portaria...";

  try {
    await ensureAuth();
    const snap = await getDocs(collection(db, "whitelist"));
    whitelistEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Bootstrap automático do primeiro Administrador se a base estiver vazia.
    // Faz signInAnonymously ANTES de gravar para satisfazer as regras do Firestore
    // (escrita apenas para usuários autenticados).
    if (whitelistEntries.length === 0) {
      const adminName = document.getElementById("gateAdminNameInput").value.trim() || "Diego Santos";
      await signInAnonymously(auth);
      const firstAdmin = {
        name: adminName,
        phone: phoneNorm,
        role: "admin",
        company: "iMile Delivery",
        base: "CD SP • São Paulo - SP",
        token: "ADMIN01",
        active: true,
        avatarUrl: DEFAULT_AVATAR,
        coverUrl: DEFAULT_COVER,
        ringColor: "#4f46e5",
        avatarEmoji: "👑",
        vibe: "Liderando a operação conectada! 🚀"
      };
      await setDoc(doc(db, "whitelist", phoneNorm), firstAdmin);
      await completeLogin({ id: phoneNorm, ...firstAdmin });
      return;
    }

    const entry = whitelistEntries.find((w) => w.id === phoneNorm);
    if (!entry || entry.active === false) {
      errBox.textContent = "⛔ Acesso Negado: Este celular não consta na lista de convidados autorizados.";
      errBox.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Validar Celular e Entrar →";
      return;
    }

    await completeLogin(entry);
  } catch (err) {
    console.error(err);
    errBox.textContent = "Erro ao conectar ao Firebase. Verifique o js/firebase-config.js e as regras do Firestore.";
    errBox.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Validar Celular e Entrar →";
  }
});

async function completeLogin(whitelistProfile) {
  let authUser = auth.currentUser;
  if (!authUser) {
    const cred = await signInAnonymously(auth);
    authUser = cred.user;
  }
  currentUser = {
    uid: authUser.uid,
    phone: whitelistProfile.id,
    name: whitelistProfile.name || "Colaborador",
    role: whitelistProfile.role || "equipe",
    company: whitelistProfile.company || (whitelistProfile.role === "fornecedor" ? "Transportador Parceiro" : "iMile Delivery"),
    base: whitelistProfile.base || "CD SP • São Paulo - SP",
    avatarUrl: whitelistProfile.avatarUrl || DEFAULT_AVATAR,
    coverUrl: whitelistProfile.coverUrl || DEFAULT_COVER,
    ringColor: whitelistProfile.ringColor || "#4f46e5",
    avatarEmoji: whitelistProfile.avatarEmoji || "🚀",
    vibe: whitelistProfile.vibe || "Operação 100% conectada! 🚀"
  };

  localStorage.setItem("cv_logged_phone", currentUser.phone);
  await setDoc(doc(db, "users", currentUser.uid), {
    phone: currentUser.phone,
    name: currentUser.name,
    role: currentUser.role,
    lastSeen: serverTimestamp()
  }, { merge: true });

  document.getElementById("gateScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");

  const bn = document.getElementById("bottomNav");
  if (bn) bn.classList.remove("hidden");

  applyRoleUI();
  renderSidebarProfile();
  renderCategories();
  startRealtimeListeners();
  initClockAndWeather();
  initRssTicker();
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("cv_logged_phone");
  location.reload();
});

// ============================================================================
// SEPARAÇÃO DE PERFIS (ADMIN / EQUIPE / FORNECEDOR)
// ============================================================================
function applyRoleUI() {
  const badgeTop = document.getElementById("roleBadgeTop");
  const navAdmin = document.getElementById("navAdminBtn");
  const catSelect = document.getElementById("postCategoryInput");
  const highlightBox = document.getElementById("highlightOptionBox");
  const bnAdmin = document.getElementById("bnAdmin");
  if (bnAdmin) {
    if (currentUser.role === "admin") bnAdmin.classList.remove("hidden");
    else bnAdmin.classList.add("hidden");
  }

  if (currentUser.role === "admin") {
    badgeTop.textContent = "👑 Admin";
    navAdmin.classList.remove("hidden");
    highlightBox.classList.remove("hidden");
    catSelect.innerHTML = `
      <option value="Trabalho">💼 Trabalho</option>
      <option value="Fornecedores">🚚 Fornecedores</option>
      <option value="Negócios">📈 Negócios</option>
      <option value="Diversão">🎉 Diversão</option>
    `;
  } else if (currentUser.role === "fornecedor") {
    badgeTop.textContent = "🚚 Fornecedor";
    navAdmin.classList.add("hidden");
    highlightBox.classList.add("hidden");
    catSelect.innerHTML = `
      <option value="Fornecedores">🚚 Fornecedores</option>
      <option value="Negócios">📈 Negócios</option>
      <option value="Diversão">🎉 Diversão</option>
    `;
  } else {
    badgeTop.textContent = "👷 Equipe";
    navAdmin.classList.add("hidden");
    highlightBox.classList.remove("hidden");
    catSelect.innerHTML = `
      <option value="Trabalho">💼 Trabalho</option>
      <option value="Fornecedores">🚚 Fornecedores</option>
      <option value="Negócios">📈 Negócios</option>
      <option value="Diversão">🎉 Diversão</option>
    `;
  }
}

function renderCategories() {
  const container = document.getElementById("categoryList");
  const allowed = currentUser.role === "fornecedor" ? SUPPLIER_ALLOWED_CATS : ALL_CATEGORIES.map((c) => c.id);

  container.innerHTML = ALL_CATEGORIES
    .filter((c) => allowed.includes(c.id))
    .map((c) => {
      const count = getVisiblePosts().filter((p) => {
        if (c.id === "all") return true;
        if (c.id === "featured") return p.isFeatured;
        return p.category === c.id;
      }).length;
      const isActive = activeCategory === c.id;
      return `
        <button
          data-cat="${c.id}"
          class="cat-btn w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            isActive ? "bg-indigo-50 text-[#4f46e5]" : "text-slate-600 hover:bg-slate-50"
          }"
        >
          <span>${c.label}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            isActive ? "bg-[#4f46e5] text-white" : "bg-slate-100 text-slate-600"
          }">${count}</span>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      authorFilterPhone = null;
      const catObj = ALL_CATEGORIES.find((x) => x.id === activeCategory);
      document.getElementById("activeCategoryPill").textContent = catObj ? catObj.label : "✨ Todos os Posts";
      renderCategories();
      renderFeed();
    });
  });
}

// ============================================================================
// TEMPO REAL NO FIRESTORE (POSTS & WHITELIST)
// ============================================================================
function startRealtimeListeners() {
  const postsQuery = query(collection(db, "posts"), orderBy("createdAtMs", "desc"));
  onSnapshot(postsQuery, (snapshot) => {
    allPosts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    updatePendingCounter();
    renderCategories();
    renderFeed();
    renderSupplierQueue();
  });

  onSnapshot(collection(db, "whitelist"), (snapshot) => {
    whitelistEntries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderWhitelistTable();
  });

  onSnapshot(query(collection(db, "recados_voz"), orderBy("createdAtMs", "desc")), (snapshot) => {
    voiceMessages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderVoiceUI();
    renderVoiceAdmin();
  });
}

function getVisiblePosts() {
  return allPosts.filter((p) => {
    if (p.status !== "aprovado") return false;
    if (currentUser.role === "fornecedor" && p.category === "Trabalho") return false;
    return true;
  });
}

function updatePendingCounter() {
  const pending = allPosts.filter((p) => p.status === "pendente");
  const badge = document.getElementById("pendingCountBadge");
  if (pending.length > 0) {
    badge.textContent = pending.length;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// ============================================================================
// RENDERIZAÇÃO DO FEED MASONRY (DESTAQUES FIXADOS NO TOPO)
// ============================================================================
function dayKey(ms) {
  const d = new Date(ms || Date.now());
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(key) {
  const parts = key.split("-").map(Number);
  const d = new Date(parts[0], parts[1], parts[2]);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const yestKey = `${yest.getFullYear()}-${yest.getMonth()}-${yest.getDate()}`;
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (key === todayKey) return `HOJE • ${cap(weekday)}, ${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}`;
  if (key === yestKey) return `ONTEM • ${cap(weekday)}, ${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}`;
  return `${String(d.getDate()).padStart(2, "0")} DE ${d.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase()}`;
}

function renderFeed() {
  const container = document.getElementById("postsMasonryContainer");
  const emptyState = document.getElementById("emptyFeedState");

  let list = getVisiblePosts();

  if (authorFilterPhone) {
    list = list.filter((p) => p.authorPhone === authorFilterPhone);
  } else if (activeCategory === "featured") {
    list = list.filter((p) => p.isFeatured);
  } else if (activeCategory !== "all") {
    list = list.filter((p) => p.category === activeCategory);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (p) =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.content || "").toLowerCase().includes(q) ||
        (p.authorName || "").toLowerCase().includes(q) ||
        (p.authorBase || "").toLowerCase().includes(q)
    );
  }

  // Ordenação base por data (mais recentes primeiro)
  list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

  if (list.length === 0) {
    container.className = "";
    container.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  // Separa destaques (fixados no topo) do restante
  const featured = list.filter((p) => p.isFeatured);
  const regular = list.filter((p) => !p.isFeatured);

  // Agrupa o restante por dia
  const groups = new Map();
  for (const p of regular) {
    const k = dayKey(p.createdAtMs);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }

  let html = "";
  if (featured.length > 0) {
    html += `<section class="mb-6"><h2 class="feed-date-header">⭐ Destaques</h2><div class="featured-carousel">${featured.map(buildPostCardHTML).join("")}</div></section>`;
  }
  for (const [k, posts] of groups) {
    html += `<section class="mb-6"><h2 class="feed-date-header">${dayLabel(k)}</h2><div class="masonry-grid">${posts.map(buildPostCardHTML).join("")}</div></section>`;
  }

  container.className = "";
  container.innerHTML = html;
  bindPostCardEvents();
}

function buildPostCardHTML(post) {
  const cientes = Array.isArray(post.cientes) ? post.cientes : [];
  const iGaveCiente = cientes.some((c) => c.phone === currentUser.phone);
  const reactions = post.reactions || { "🔥": 0, "👏": 0, "🚀": 0, "❤️": 0 };

  const borderClass = post.isFeatured
    ? "border-2 border-amber-400 shadow-md shadow-amber-500/10"
    : "border border-slate-200 shadow-sm";

  const mediaHTML = post.videoUrl
    ? `<div class="relative bg-slate-950 overflow-hidden">
        <video src="${post.videoUrl}" muted loop playsinline controls class="w-full max-h-80 object-contain mx-auto"></video>
        <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-xs font-extrabold shadow">${post.topEmoji || "🎬"} ${escapeHtml(post.category)}</span>
        ${post.isFeatured ? `<span class="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-extrabold text-slate-950 shadow-md" style="background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);">${escapeHtml(post.featuredLabel || "⭐ Área de Destaque")}</span>` : ""}
      </div>`
    : post.imageUrl
    ? `<div class="relative bg-slate-900 overflow-hidden cursor-pointer open-read-trigger" data-id="${post.id}">
        <img src="${post.imageUrl}" alt="${escapeHtml(post.title)}" class="w-full max-h-96 object-contain mx-auto" />
        <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-xs font-extrabold text-slate-900 shadow">${post.topEmoji || "🚀"} ${escapeHtml(post.category)}</span>
        ${post.isFeatured ? `<span class="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-extrabold text-slate-950 shadow-md" style="background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);">${escapeHtml(post.featuredLabel || "⭐ Área de Destaque")}</span>` : ""}
        <span class="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-full bg-slate-950/75 text-white text-[11px] font-bold">👁️ ${post.views || 0}</span>
      </div>`
    : `<div class="px-4 pt-4 flex items-center justify-between gap-2">
        <span class="px-2.5 py-1 rounded-full bg-indigo-50 text-[#4f46e5] text-xs font-extrabold">${post.topEmoji || "📢"} ${escapeHtml(post.category)}</span>
        ${post.isFeatured ? `<span class="px-3 py-1 rounded-full text-xs font-extrabold text-slate-950 shadow-sm" style="background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);">${escapeHtml(post.featuredLabel || "⭐ Área de Destaque")}</span>` : ""}
      </div>`;

  const musicHTML = post.musicTrack
    ? `<div class="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
        <button type="button" class="play-post-music w-8 h-8 rounded-lg bg-[#4f46e5] text-white text-xs font-bold flex items-center justify-center shrink-0 cursor-pointer" data-preview="${post.musicTrack.previewUrl}" data-title="${post.musicTrack.title}" data-artist="${post.musicTrack.artist}">▶</button>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-extrabold text-slate-900 truncate">${escapeHtml(post.musicTrack.title)}</p>
          <p class="text-[10px] text-slate-500 truncate">${escapeHtml(post.musicTrack.artist)}</p>
        </div>
        <div class="flex items-end gap-0.5 h-4 px-1">
          <span class="w-1 bg-[#4f46e5] rounded-full eq-bar-1"></span>
          <span class="w-1 bg-[#4f46e5] rounded-full eq-bar-2"></span>
          <span class="w-1 bg-[#4f46e5] rounded-full eq-bar-3"></span>
        </div>
      </div>`
    : "";

  const adminDeleteBtn = currentUser.role === "admin"
    ? `<button type="button" class="delete-post-btn text-[11px] font-bold text-rose-500 hover:underline cursor-pointer" data-id="${post.id}">Excluir</button>`
    : "";

  return `
    <article class="masonry-item rounded-2xl bg-white overflow-hidden ${borderClass}">
      ${mediaHTML}
      <div class="p-4">
        <!-- Autor Clicável -->
        <div class="flex items-center justify-between gap-2 mb-3">
          <button type="button" class="open-author-trigger flex items-center gap-2.5 text-left min-w-0 cursor-pointer" data-phone="${post.authorPhone}">
            <div class="w-10 h-10 rounded-xl p-0.5 shrink-0" style="background-color: ${post.authorRingColor || "#4f46e5"};">
              <img src="${post.authorAvatar || DEFAULT_AVATAR}" alt="${post.authorName}" class="w-full h-full object-cover rounded-[10px]" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-extrabold text-slate-900 truncate">${escapeHtml(post.authorName)}</span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  post.authorRole === "fornecedor" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-[#4f46e5]"
                }">${post.authorRole === "fornecedor" ? "🚚 Parceiro" : "🏢 iMile"}</span>
              </div>
              <p class="text-[11px] text-slate-500 truncate">${escapeHtml(post.authorBase || "CD SP")} • ${escapeHtml(post.timeLabel || "Agora")}</p>
            </div>
          </button>
          ${adminDeleteBtn}
        </div>

        <h3 class="text-base font-extrabold text-slate-900 leading-snug mb-1.5">${escapeHtml(post.title)}</h3>
        <div class="text-xs text-slate-600 leading-relaxed">${formatRichText(post.content)}</div>

        ${musicHTML}

        <!-- Barra Ciente + WhatsApp -->
        <div class="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button
              type="button"
              data-id="${post.id}"
              class="toggle-ciente-btn px-3 py-1.5 rounded-full text-xs font-extrabold transition cursor-pointer ${
                iGaveCiente ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 hover:bg-emerald-50 text-slate-700"
              }"
            >
              ✅ Ciente (${cientes.length})
            </button>
            <button type="button" data-id="${post.id}" class="view-cientes-btn text-[11px] font-bold text-[#4f46e5] hover:underline cursor-pointer">
              Ver cientes
            </button>
          </div>

          <button
            type="button"
            data-id="${post.id}"
            class="share-wa-btn px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-[11px] font-bold cursor-pointer"
          >
            📲 WhatsApp
          </button>
        </div>

        <!-- Reações -->
        <div class="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1">
          <div class="flex items-center gap-1">
            ${["🔥", "👏", "🚀", "❤️"]
              .map(
                (emoji) => `
              <button type="button" data-id="${post.id}" data-emoji="${emoji}" class="react-btn px-2 py-1 rounded-full bg-slate-50 hover:bg-indigo-50 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                ${emoji} ${reactions[emoji] || 0}
              </button>`
              )
              .join("")}
          </div>
          <button type="button" data-id="${post.id}" class="open-read-trigger text-xs font-extrabold text-[#4f46e5] hover:underline cursor-pointer">
            Ler mais →
          </button>
        </div>
      </div>
    </article>
  `;
}

function bindPostCardEvents() {
  document.querySelectorAll(".react-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { id, emoji } = btn.dataset;
      await updateDoc(doc(db, "posts", id), { [`reactions.${emoji}`]: increment(1) });
    });
  });

  document.querySelectorAll(".toggle-ciente-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const post = allPosts.find((p) => p.id === btn.dataset.id);
      if (!post) return;
      const cientes = Array.isArray(post.cientes) ? post.cientes : [];
      const existing = cientes.find((c) => c.phone === currentUser.phone);
      const ref = doc(db, "posts", post.id);
      if (existing) {
        await updateDoc(ref, { cientes: arrayRemove(existing) });
      } else {
        await updateDoc(ref, {
          cientes: arrayUnion({
            phone: currentUser.phone,
            name: currentUser.name,
            base: currentUser.base,
            role: currentUser.role,
            avatar: currentUser.avatarUrl,
            at: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          })
        });
      }
    });
  });

  document.querySelectorAll(".view-cientes-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const post = allPosts.find((p) => p.id === btn.dataset.id);
      if (!post) return;
      const list = Array.isArray(post.cientes) ? post.cientes : [];
      const container = document.getElementById("cientesListContainer");
      container.innerHTML =
        list.length === 0
          ? `<p class="text-xs text-slate-500 text-center py-4">Nenhuma confirmação de leitura registrada ainda.</p>`
          : list
              .map(
                (c) => `
              <div class="py-2.5 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2.5">
                  <img src="${c.avatar || DEFAULT_AVATAR}" class="w-8 h-8 rounded-lg object-cover" />
                  <div>
                    <p class="text-xs font-extrabold text-slate-900">${escapeHtml(c.name)}</p>
                    <p class="text-[11px] text-slate-500">${escapeHtml(c.base || "Operação")}</p>
                  </div>
                </div>
                <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">✅ ${c.at || "Lido"}</span>
              </div>`
              )
              .join("");
      document.getElementById("cientesModal").classList.remove("hidden");
    });
  });

  document.querySelectorAll(".share-wa-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const post = allPosts.find((p) => p.id === btn.dataset.id);
      if (!post) return;
      const cleanBody = String(post.content || "").replace(/==|\*\*|_/g, "");
      const header = post.isFeatured ? `*${post.featuredLabel || "⭐ DESTAQUE"}*\n` : "";
      const text = `${header}*[${post.category}] ${post.title}*\n${cleanBody}\n\n— _${post.authorName} (${post.authorBase}) via ConectaVibe_\n${window.location.href}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    });
  });

  document.querySelectorAll(".open-read-trigger").forEach((el) => {
    el.addEventListener("click", async () => {
      const post = allPosts.find((p) => p.id === el.dataset.id);
      if (!post) return;
      await updateDoc(doc(db, "posts", post.id), { views: increment(1) });
      document.getElementById("readModalCategory").textContent = `${post.topEmoji || "📢"} ${post.category}`;
      document.getElementById("readModalViews").textContent = `👁️ ${(post.views || 0) + 1} visualizações`;
      document.getElementById("readModalBody").innerHTML = `
        ${post.imageUrl ? `<div class="bg-slate-950"><img src="${post.imageUrl}" class="w-full max-h-[60vh] object-contain mx-auto" /></div>` : ""}
        ${post.videoUrl ? `<div class="bg-slate-950"><video src="${post.videoUrl}" controls autoplay class="w-full max-h-[60vh] object-contain mx-auto"></video></div>` : ""}
        <div class="p-6">
          <div class="flex items-center gap-3 mb-4">
            <img src="${post.authorAvatar || DEFAULT_AVATAR}" class="w-11 h-11 rounded-xl object-cover" />
            <div>
              <p class="text-sm font-extrabold text-slate-900">${escapeHtml(post.authorName)}</p>
              <p class="text-xs text-slate-500">${escapeHtml(post.authorBase)} • ${escapeHtml(post.timeLabel || "Agora")}</p>
            </div>
          </div>
          <h2 class="text-xl font-extrabold text-slate-900 mb-3">${escapeHtml(post.title)}</h2>
          <div class="text-sm text-slate-700 leading-relaxed">${formatRichText(post.content)}</div>
        </div>
      `;
      document.getElementById("readModal").classList.remove("hidden");
    });
  });

  document.querySelectorAll(".open-author-trigger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phone = btn.dataset.phone;
      const wl = whitelistEntries.find((w) => w.id === phone);
      const postFallback = allPosts.find((p) => p.authorPhone === phone);
      const data = wl || {
        name: postFallback?.authorName || "Colaborador",
        role: postFallback?.authorRole || "equipe",
        base: postFallback?.authorBase || "CD SP",
        avatarUrl: postFallback?.authorAvatar || DEFAULT_AVATAR,
        coverUrl: DEFAULT_COVER,
        ringColor: postFallback?.authorRingColor || "#4f46e5",
        avatarEmoji: "🚀",
        vibe: "Operação conectada!"
      };

      document.getElementById("authorCardCover").src = data.coverUrl || DEFAULT_COVER;
      document.getElementById("authorCardAvatar").src = data.avatarUrl || DEFAULT_AVATAR;
      document.getElementById("authorCardRing").style.backgroundColor = data.ringColor || "#4f46e5";
      document.getElementById("authorCardEmoji").textContent = data.avatarEmoji || "🚀";
      document.getElementById("authorCardName").textContent = data.name;
      document.getElementById("authorCardTypeBadge").textContent =
        data.role === "fornecedor" ? "🚚 Transportador / Parceiro" : "🏢 iMile Delivery";
      document.getElementById("authorCardBase").textContent = data.base;
      document.getElementById("authorCardVibe").textContent = `"${data.vibe || "Operação 100% conectada!"}"`;

      document.getElementById("filterByAuthorBtn").onclick = () => {
        authorFilterPhone = phone;
        document.getElementById("activeCategoryPill").textContent = `👤 Posts de ${data.name}`;
        document.getElementById("authorCardModal").classList.add("hidden");
        renderFeed();
      };

      document.getElementById("authorCardModal").classList.remove("hidden");
    });
  });

  // Re-observa os botões de música do feed (parar ao sair da tela)
  musicObserver.disconnect();
  document.querySelectorAll(".play-post-music").forEach((btn) => {
    btn.textContent = "▶";
    btn.addEventListener("click", () => {
      const same = activeMusicBtn === btn;
      if (same && !audioPlayer.paused) {
        audioPlayer.pause();
        return;
      }
      activeMusicBtn = btn;
      document.querySelectorAll(".play-post-music").forEach((b) => { b.textContent = "▶"; });
      audioPlayer.src = btn.dataset.preview;
      audioPlayer.play().catch(() => {});
      document.getElementById("radioTrackTitle").textContent = btn.dataset.title;
      document.getElementById("radioTrackArtist").textContent = btn.dataset.artist;
      document.getElementById("radioPlayPauseBtn").textContent = "❚❚";
      btn.textContent = "❚❚";
    });
    musicObserver.observe(btn);
  });

  document.querySelectorAll(".delete-post-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Excluir esta publicação permanentemente?")) {
        await deleteDoc(doc(db, "posts", btn.dataset.id));
      }
    });
  });
}

// ============================================================================
// CRIAÇÃO DE NOVA PUBLICAÇÃO (RICH TEXT, DESTAQUE, FOTO/VÍDEO E MÚSICA)
// ============================================================================
function openNewPostModal() {
  draftImageBase64 = null;
  draftVideoBase64 = null;
  draftMusicTrack = null;
  document.getElementById("newPostForm").reset();
  document.getElementById("featuredBadgeConfig").classList.add("hidden");
  document.getElementById("postMediaPreviewBox").classList.add("hidden");
  document.getElementById("clearPostMediaBtn").classList.add("hidden");
  document.getElementById("selectedMusicChip").classList.add("hidden");
  document.getElementById("newPostModal").classList.remove("hidden");
}

document.getElementById("topNewPostBtn").addEventListener("click", openNewPostModal);
document.getElementById("sidebarNewPostBtn")?.addEventListener("click", openNewPostModal);
document.getElementById("closeNewPostModalBtn").addEventListener("click", () => document.getElementById("newPostModal").classList.add("hidden"));
document.getElementById("cancelNewPostBtn").addEventListener("click", () => document.getElementById("newPostModal").classList.add("hidden"));

document.getElementById("postIsFeaturedInput").addEventListener("change", (e) => {
  document.getElementById("featuredBadgeConfig").classList.toggle("hidden", !e.target.checked);
});

document.querySelectorAll(".badge-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("postFeaturedLabelInput").value = btn.dataset.val;
  });
});

// Formatação de texto e emojis
document.querySelectorAll(".fmt-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ta = document.getElementById("postContentInput");
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.substring(start, end) || "texto";
    const fmt = btn.dataset.fmt;
    let wrapped = sel;
    if (fmt === "bold") wrapped = `**${sel}**`;
    if (fmt === "italic") wrapped = `_${sel}_`;
    if (fmt === "mark") wrapped = `==${sel}==`;
    if (fmt === "upper") wrapped = sel.toUpperCase();
    if (fmt === "bullet") wrapped = `• ${sel}`;
    ta.setRangeText(wrapped, start, end, "end");
    ta.focus();
  });
});

document.querySelectorAll(".emoji-insert").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ta = document.getElementById("postContentInput");
    ta.setRangeText(btn.dataset.emoji, ta.selectionStart, ta.selectionEnd, "end");
    ta.focus();
  });
});

// Upload Foto
document.getElementById("postImageFileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  draftVideoBase64 = null;
  draftImageBase64 = await compressImageFile(file, 960, 0.78);
  const box = document.getElementById("postMediaPreviewBox");
  box.innerHTML = `<img src="${draftImageBase64}" class="max-h-56 object-contain" />`;
  box.classList.remove("hidden");
  document.getElementById("clearPostMediaBtn").classList.remove("hidden");
});

// Upload Vídeo Curto (<= 20s)
document.getElementById("postVideoFileInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 780 * 1024) {
    alert("Para manter o banco gratuito rápido no celular, envie vídeos curtos de até 750 KB (aprox. 10–15s compactado).");
    e.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const tempVid = document.createElement("video");
    tempVid.preload = "metadata";
    tempVid.onloadedmetadata = () => {
      if (tempVid.duration > 20.5) {
        alert("O vídeo deve ter no máximo 20 segundos.");
        return;
      }
      draftImageBase64 = null;
      draftVideoBase64 = ev.target.result;
      const box = document.getElementById("postMediaPreviewBox");
      box.innerHTML = `<video src="${draftVideoBase64}" controls muted class="max-h-56 object-contain"></video>`;
      box.classList.remove("hidden");
      document.getElementById("clearPostMediaBtn").classList.remove("hidden");
    };
    tempVid.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById("clearPostMediaBtn").addEventListener("click", () => {
  draftImageBase64 = null;
  draftVideoBase64 = null;
  document.getElementById("postMediaPreviewBox").classList.add("hidden");
  document.getElementById("clearPostMediaBtn").classList.add("hidden");
});

// Busca de Música Real via JSONP (iTunes API sem bloqueio CORS)
document.getElementById("musicSearchBtn").addEventListener("click", () => {
  const term = document.getElementById("musicSearchInput").value.trim();
  if (!term) return;
  const cbName = "itunesCb_" + Date.now();
  window[cbName] = (data) => {
    delete window[cbName];
    const resultsBox = document.getElementById("musicSearchResults");
    const tracks = (data.results || []).filter((t) => t.previewUrl).slice(0, 6);
    if (tracks.length === 0) {
      resultsBox.innerHTML = `<p class="p-3 text-xs text-slate-500">Nenhuma música encontrada.</p>`;
    } else {
      resultsBox.innerHTML = tracks
        .map(
          (t) => `
          <button type="button" class="select-track-btn w-full px-3 py-2 text-left hover:bg-indigo-50 flex items-center justify-between gap-2 cursor-pointer"
            data-title="${t.trackName.replace(/"/g, "&quot;")}"
            data-artist="${t.artistName.replace(/"/g, "&quot;")}"
            data-preview="${t.previewUrl}">
            <div class="min-w-0">
              <p class="text-xs font-bold text-slate-900 truncate">${t.trackName}</p>
              <p class="text-[10px] text-slate-500 truncate">${t.artistName}</p>
            </div>
            <span class="text-[11px] font-bold text-[#4f46e5]">+ Usar</span>
          </button>`
        )
        .join("");
    }
    resultsBox.classList.remove("hidden");
    resultsBox.querySelectorAll(".select-track-btn").forEach((b) => {
      b.addEventListener("click", () => {
        draftMusicTrack = { title: b.dataset.title, artist: b.dataset.artist, previewUrl: b.dataset.preview };
        document.getElementById("selectedMusicLabel").textContent = `🎵 ${draftMusicTrack.title} — ${draftMusicTrack.artist}`;
        document.getElementById("selectedMusicChip").classList.remove("hidden");
        document.getElementById("selectedMusicChip").classList.add("flex");
        resultsBox.classList.add("hidden");
      });
    });
  };
  const script = document.createElement("script");
  script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=8&callback=${cbName}`;
  document.body.appendChild(script);
});

document.getElementById("removeSelectedMusicBtn").addEventListener("click", () => {
  draftMusicTrack = null;
  document.getElementById("selectedMusicChip").classList.add("hidden");
});

document.getElementById("newPostForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const isSupplier = currentUser.role === "fornecedor";
  const isFeatured = !isSupplier && document.getElementById("postIsFeaturedInput").checked;
  const nowStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const newDoc = {
    authorUid: currentUser.uid,
    authorPhone: currentUser.phone,
    authorName: currentUser.name,
    authorRole: currentUser.role,
    authorBase: currentUser.base,
    authorAvatar: currentUser.avatarUrl,
    authorRingColor: currentUser.ringColor,
    category: document.getElementById("postCategoryInput").value,
    topEmoji: document.getElementById("postEmojiInput").value,
    isFeatured,
    featuredLabel: isFeatured ? document.getElementById("postFeaturedLabelInput").value.trim() || "⭐ Área de Destaque" : "",
    title: document.getElementById("postTitleInput").value.trim(),
    content: document.getElementById("postContentInput").value.trim(),
    imageUrl: draftImageBase64 || null,
    videoUrl: draftVideoBase64 || null,
    musicTrack: draftMusicTrack || null,
    status: isSupplier ? "pendente" : "aprovado",
    views: 1,
    reactions: { "🔥": 0, "👏": 0, "🚀": 0, "❤️": 0 },
    cientes: [],
    timeLabel: `Hoje, ${nowStr}`,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now()
  };

  await addDoc(collection(db, "posts"), newDoc);
  document.getElementById("newPostModal").classList.add("hidden");

  if (isSupplier) {
    alert("✅ Comunicado enviado! Como perfil Fornecedor, ele aguarda aprovação rápida do Administrador.");
  }
});

// ============================================================================
// PERFIL, FOTO DE CAPA & PALETA DE CORES
// ============================================================================
function renderSidebarProfile() {
  document.getElementById("sidebarAvatarImg").src = currentUser.avatarUrl;
  document.getElementById("sidebarAvatarRing").style.backgroundColor = currentUser.ringColor;
  document.getElementById("sidebarAvatarEmoji").textContent = currentUser.avatarEmoji;
  document.getElementById("sidebarUserName").textContent = currentUser.name;
  document.getElementById("sidebarUserSub").textContent = currentUser.base;
  document.getElementById("sidebarVibeText").textContent = `"${currentUser.vibe}"`;

  // Banner compacto mobile
  const mcbAvatarImg = document.getElementById("mcbAvatarImg");
  if (mcbAvatarImg) {
    mcbAvatarImg.src = currentUser.avatarUrl;
    document.getElementById("mcbAvatarRing").style.backgroundColor = currentUser.ringColor;
    document.getElementById("mcbAvatarEmoji").textContent = currentUser.avatarEmoji;
    document.getElementById("mcbName").textContent = currentUser.name;
    document.getElementById("mcbSub").textContent = currentUser.base;
    document.getElementById("mcbVibe").textContent = `"${currentUser.vibe}"`;
  }
}

document.getElementById("openProfileModalBtn").addEventListener("click", () => {
  document.getElementById("modalCoverPreview").src = currentUser.coverUrl || DEFAULT_COVER;
  document.getElementById("modalAvatarPreview").src = currentUser.avatarUrl || DEFAULT_AVATAR;
  document.getElementById("modalAvatarRing").style.backgroundColor = currentUser.ringColor;
  document.getElementById("modalAvatarEmojiBadge").textContent = currentUser.avatarEmoji;
  document.getElementById("profNameInput").value = currentUser.name;
  document.getElementById("profBaseInput").value = currentUser.base;
  document.getElementById("profVibeInput").value = currentUser.vibe;

  document.getElementById("ringColorPalette").innerHTML = RING_COLORS.map(
    (c) => `<button type="button" data-color="${c}" class="ring-pick w-7 h-7 rounded-full border-2 border-white shadow cursor-pointer" style="background-color:${c};"></button>`
  ).join("");
  document.querySelectorAll(".ring-pick").forEach((b) => {
    b.addEventListener("click", () => {
      currentUser.ringColor = b.dataset.color;
      document.getElementById("modalAvatarRing").style.backgroundColor = currentUser.ringColor;
    });
  });

  document.getElementById("profileEmojiGrid").innerHTML = PROFILE_EMOJIS.map(
    (em) => `<button type="button" data-em="${em}" class="em-pick px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-sm cursor-pointer">${em}</button>`
  ).join("");
  document.querySelectorAll(".em-pick").forEach((b) => {
    b.addEventListener("click", () => {
      currentUser.avatarEmoji = b.dataset.em;
      document.getElementById("modalAvatarEmojiBadge").textContent = currentUser.avatarEmoji;
    });
  });

  document.getElementById("profileModal").classList.remove("hidden");
});

document.getElementById("profileAvatarFileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  currentUser.avatarUrl = await compressImageFile(file, 360, 0.8);
  document.getElementById("modalAvatarPreview").src = currentUser.avatarUrl;
});

document.getElementById("profileCoverFileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  currentUser.coverUrl = await compressImageFile(file, 960, 0.78);
  document.getElementById("modalCoverPreview").src = currentUser.coverUrl;
});

document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  currentUser.name = document.getElementById("profNameInput").value.trim() || currentUser.name;
  currentUser.base = document.getElementById("profBaseInput").value.trim() || currentUser.base;
  currentUser.vibe = document.getElementById("profVibeInput").value.trim() || currentUser.vibe;

  await updateDoc(doc(db, "whitelist", currentUser.phone), {
    name: currentUser.name,
    base: currentUser.base,
    vibe: currentUser.vibe,
    avatarUrl: currentUser.avatarUrl,
    coverUrl: currentUser.coverUrl,
    ringColor: currentUser.ringColor,
    avatarEmoji: currentUser.avatarEmoji
  });

  renderSidebarProfile();
  document.getElementById("profileModal").classList.add("hidden");
});

document.getElementById("editVibeBtn").addEventListener("click", async () => {
  const next = prompt("Digite sua nova frase de status / vibe:", currentUser.vibe);
  if (next && next.trim()) {
    currentUser.vibe = next.trim();
    await updateDoc(doc(db, "whitelist", currentUser.phone), { vibe: currentUser.vibe });
    renderSidebarProfile();
  }
});

// ============================================================================
// PAINEL ADMIN: FILA DE FORNECEDORES, PORTARIA WHATSAPP & BACKUP
// ============================================================================
document.getElementById("navFeedBtn").addEventListener("click", () => {
  document.getElementById("feedSection").classList.remove("hidden");
  document.getElementById("adminSection").classList.add("hidden");
  document.getElementById("leftSidebar")?.classList.remove("hidden");
  document.getElementById("rightSidebar")?.classList.remove("hidden");
  document.getElementById("navFeedBtn").classList.add("bg-white", "text-[#4f46e5]", "shadow-sm");
  document.getElementById("navAdminBtn").classList.remove("bg-white", "text-[#4f46e5]", "shadow-sm");
});

document.getElementById("navAdminBtn").addEventListener("click", () => {
  document.getElementById("feedSection").classList.add("hidden");
  document.getElementById("adminSection").classList.remove("hidden");
  document.getElementById("leftSidebar")?.classList.add("hidden");
  document.getElementById("rightSidebar")?.classList.add("hidden");
  document.getElementById("navAdminBtn").classList.add("bg-white", "text-[#4f46e5]", "shadow-sm");
  document.getElementById("navFeedBtn").classList.remove("bg-white", "text-[#4f46e5]", "shadow-sm");
});

function renderSupplierQueue() {
  const box = document.getElementById("supplierQueueContainer");
  const pending = allPosts.filter((p) => p.status === "pendente");
  if (pending.length === 0) {
    box.innerHTML = `<p class="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl">Nenhum post de fornecedor aguardando aprovação no momento.</p>`;
    return;
  }
  box.innerHTML = pending
    .map(
      (p) => `
      <div class="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-extrabold uppercase text-amber-800">${escapeHtml(p.authorName)} • ${escapeHtml(p.category)}</span>
          <p class="text-xs font-extrabold text-slate-900">${escapeHtml(p.title)}</p>
          <p class="text-xs text-slate-600">${escapeHtml(p.content)}</p>
        </div>
        <div class="flex items-center gap-2">
          <button data-id="${p.id}" class="approve-post-btn px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer">✓ Aprovar</button>
          <button data-id="${p.id}" class="reject-post-btn px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer">✕ Recusar</button>
        </div>
      </div>`
    )
    .join("");

  box.querySelectorAll(".approve-post-btn").forEach((b) =>
    b.addEventListener("click", () => updateDoc(doc(db, "posts", b.dataset.id), { status: "aprovado" }))
  );
  box.querySelectorAll(".reject-post-btn").forEach((b) =>
    b.addEventListener("click", () => deleteDoc(doc(db, "posts", b.dataset.id)))
  );
}

document.getElementById("inviteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("invName").value.trim();
  const phone = normalizeBrPhone(document.getElementById("invPhone").value);
  const role = document.getElementById("invRole").value;
  const base = document.getElementById("invBase").value.trim() || "CD SP • São Paulo - SP";
  const token = "CV-" + Math.floor(1000 + Math.random() * 9000);

  if (phone.length < 12) {
    alert("Informe um celular válido com DDD.");
    return;
  }

  await setDoc(doc(db, "whitelist", phone), {
    name,
    phone,
    role,
    base,
    token,
    active: true,
    avatarUrl: DEFAULT_AVATAR,
    coverUrl: DEFAULT_COVER,
    ringColor: "#4f46e5",
    avatarEmoji: role === "admin" ? "👑" : role === "fornecedor" ? "🚚" : "🚀",
    vibe: "Conectado no ConectaVibe!"
  });

  const waMsg = `Olá *${name}*! Você foi convidado(a) para o mural corporativo *ConectaVibe*.\n\n📱 *Seu celular autorizado:* ${formatPhoneDisplay(phone)}\n🔑 *Código de acesso:* ${token}\n🔗 *Acesse pelo navegador:* ${window.location.href}`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`, "_blank");
  document.getElementById("inviteForm").reset();
});

function renderWhitelistTable() {
  const tbody = document.getElementById("whitelistTableBody");
  tbody.innerHTML = whitelistEntries
    .map(
      (w) => `
      <tr>
        <td class="py-2.5 px-3 font-bold text-slate-900">${escapeHtml(w.name)}</td>
        <td class="py-2.5 px-3 font-mono text-slate-600">${escapeHtml(formatPhoneDisplay(w.id))}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            w.role === "admin"
              ? "bg-indigo-100 text-[#4f46e5]"
              : w.role === "fornecedor"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-700"
          }">${w.role === "admin" ? "👑 Admin" : w.role === "fornecedor" ? "🚚 Fornecedor" : "👷 Equipe"}</span>
        </td>
        <td class="py-2.5 px-3 text-slate-500">${escapeHtml(w.base || "-")}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${escapeHtml(w.token || "-")}</td>
        <td class="py-2.5 px-3 text-right space-x-2">
          ${w.role !== "admin" ? `<button data-id="${w.id}" class="promote-admin-btn text-[11px] font-bold text-[#4f46e5] hover:underline cursor-pointer">Tornar Admin</button>` : ""}
          ${w.id !== currentUser.phone ? `<button data-id="${w.id}" class="revoke-user-btn text-[11px] font-bold text-rose-600 hover:underline cursor-pointer">Revogar</button>` : ""}
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".promote-admin-btn").forEach((b) =>
    b.addEventListener("click", () => updateDoc(doc(db, "whitelist", b.dataset.id), { role: "admin" }))
  );
  tbody.querySelectorAll(".revoke-user-btn").forEach((b) =>
    b.addEventListener("click", () => deleteDoc(doc(db, "whitelist", b.dataset.id)))
  );
}

document.getElementById("exportBackupBtn").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    project: "conectavibe-9acb1",
    whitelist: whitelistEntries,
    posts: allPosts
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `conectavibe-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

// ============================================================================
// VOZ DA GALERA (recados em audio 24h) - audioPlayer compartilhado
// ============================================================================
let voiceMessages = [];
let voiceAudio = new Audio();
let voiceQueue = [];
let voiceIndex = 0;
let voiceActiveId = null;

function recentVoiceMessages() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return voiceMessages.filter((m) => (m.createdAtMs || 0) >= cutoff);
}

function renderVoiceUI() {
  const list = recentVoiceMessages();
  const badge = document.getElementById("voiceCountBadge");
  if (badge) badge.textContent = list.length;

  // avatares
  const strip = document.getElementById("voiceAvatarStrip");
  if (strip) {
    strip.innerHTML = list.map((m) => `
      <button class="voice-avatar-btn shrink-0 w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow cursor-pointer" data-id="${m.id}" title="${m.autorNome || ''}">
        <img src="${m.autorFoto || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22%234f46e5%22/><text x=%2250%25%22 y=%2254%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23fff%22 font-size=%2216%22 font-weight=%22900%22>CV</text></svg>'}" class="w-full h-full object-cover" />
      </button>
    `).join("");
    strip.querySelectorAll(".voice-avatar-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const m = list.find((x) => x.id === b.dataset.id);
        if (m) playVoiceOne(m);
      });
    });
  }

  // modal list
  const modalList = document.getElementById("voiceModalList");
  if (modalList) {
    modalList.innerHTML = list.length === 0
      ? `<p class="text-xs text-slate-500 text-center py-4">Nenhum recado nas últimas 24h.</p>`
      : list.map((m) => `
        <div class="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100">
          <img src="${m.autorFoto || ''}" class="w-8 h-8 rounded-full object-cover bg-slate-200" />
          <div class="min-w-0 flex-1">
            <p class="text-xs font-extrabold text-slate-900 truncate">${m.autorNome || 'Colaborador'} <span class="text-[10px] font-bold text-indigo-600">${m.tag || ''}</span></p>
            <p class="text-[10px] text-slate-500">${m.autorBase || ''} • ${m.duracao || 0}s</p>
          </div>
          <button class="voice-play-one text-[11px] font-bold text-[#4f46e5] hover:underline" data-id="${m.id}">▶</button>
          ${currentUser && currentUser.role === 'admin' ? `<button class="voice-delete-btn text-[11px] font-bold text-rose-500 hover:underline" data-id="${m.id}">✕</button>` : ""}
        </div>
      `).join("");
    modalList.querySelectorAll(".voice-play-one").forEach((b) => {
      b.addEventListener("click", () => {
        const m = list.find((x) => x.id === b.dataset.id);
        if (m) playVoiceOne(m);
      });
    });
    modalList.querySelectorAll(".voice-delete-btn").forEach((b) => {
      b.addEventListener("click", async () => {
        const m = list.find((x) => x.id === b.dataset.id);
        if (!m) return;
        if (!confirm("Apagar este recado de voz?")) return;
        try {
          if (m.storagePath) await deleteObject(ref(storage, m.storagePath));
        } catch (_) {}
        await deleteDoc(doc(db, "recados_voz", m.id));
      });
    });
  }
}

function renderVoiceAdmin() {
  const box = document.getElementById("voiceAdminContainer");
  if (!box) return;
  if (!currentUser || currentUser.role !== "admin") {
    box.innerHTML = `<p class="text-xs text-slate-500">Apenas administradores.</p>`;
    return;
  }
  if (voiceMessages.length === 0) {
    box.innerHTML = `<p class="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl">Nenhum recado de voz.</p>`;
    return;
  }
  box.innerHTML = voiceMessages.map((m) => `
    <div class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
      <img src="${m.autorFoto || ''}" class="w-8 h-8 rounded-full object-cover bg-slate-200" />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-extrabold text-slate-900 truncate">${m.autorNome || 'Colaborador'} <span class="text-[10px] font-bold text-indigo-600">${m.tag || ''}</span></p>
        <p class="text-[10px] text-slate-500">${m.autorBase || ''} • ${m.duracao || 0}s • ${new Date(m.createdAtMs || 0).toLocaleString("pt-BR")}</p>
      </div>
      <button class="voice-admin-delete text-[11px] font-bold text-rose-500 hover:underline" data-id="${m.id}" data-path="${m.storagePath || ''}">✕ Apagar</button>
    </div>
  `).join("");
  box.querySelectorAll(".voice-admin-delete").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Apagar este recado de voz?")) return;
      const path = b.dataset.path;
      try { if (path) await deleteObject(ref(storage, path)); } catch (_) {}
      await deleteDoc(doc(db, "recados_voz", b.dataset.id));
    });
  });
}

function playVoiceOne(m) {
  if (!m || !m.audioUrl) return;
  voiceActiveId = m.id;
  voiceAudio.src = m.audioUrl;
  voiceAudio.play().catch(() => {});
  const title = document.getElementById("voiceActiveTitle");
  if (title) title.textContent = `${m.autorNome || 'Colaborador'} • ${m.tag || ''}`;
  const modalTitle = document.getElementById("voiceModalTitle");
  if (modalTitle) modalTitle.textContent = `${m.autorNome || 'Colaborador'} • ${m.tag || ''}`;
  // update reactions display for active
  updateVoiceReactions(m);
}

function updateVoiceReactions(m) {
  const r = m?.reacoes || { risos: 0, fogo: 0, palmas: 0 };
  document.querySelectorAll(".voice-react-count").forEach((el) => {
    const k = el.dataset.react;
    const map = { risos: "risos", fogo: "fogo", palmas: "palmas" };
    el.textContent = r[map[k]] || 0;
  });
  // bind reaction buttons to active message
  document.querySelectorAll(".voice-react-btn").forEach((btn) => {
    btn.onclick = async () => {
      const m = voiceMessages.find((x) => x.id === voiceActiveId);
      if (!m) return;
      const key = btn.dataset.react;
      const field = `reacoes.${key}`;
      await updateDoc(doc(db, "recados_voz", m.id), { [field]: increment(1) });
    };
  });
}

function playAllVoice() {
  voiceQueue = recentVoiceMessages();
  voiceIndex = 0;
  if (voiceQueue.length === 0) return;
  playVoiceAt(0);
}

function playVoiceAt(i) {
  if (i >= voiceQueue.length) {
    voiceActiveId = null;
    const t = document.getElementById("voiceActiveTitle");
    if (t) t.textContent = "Nenhum recado tocando";
    const mt = document.getElementById("voiceModalTitle");
    if (mt) mt.textContent = "Nenhum recado tocando";
    return;
  }
  voiceIndex = i;
  playVoiceOne(voiceQueue[i]);
  voiceAudio.onended = () => playVoiceAt(i + 1);
}

voiceAudio.addEventListener("timeupdate", () => {
  const cur = voiceAudio.currentTime || 0;
  const dur = voiceAudio.duration || 0;
  const pct = dur ? (cur / dur) * 100 : 0;
  const fill = document.getElementById("voiceProgressFill");
  if (fill) fill.style.width = `${pct}%`;
  const modalFill = document.getElementById("voiceModalFill");
  if (modalFill) modalFill.style.width = `${pct}%`;
  const time = `${Math.floor(cur)}s / ${Math.floor(dur)}s`.replace(/(\d+)s/g, (m, n) => `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`);
  const vt = document.getElementById("voiceActiveTime");
  if (vt) vt.textContent = `${Math.floor(cur/60)}:${String(Math.floor(cur%60)).padStart(2,'0')} / ${Math.floor(dur/60)}:${String(Math.floor(dur%60)).padStart(2,'0')}`;
  const mt = document.getElementById("voiceModalTime");
  if (mt) mt.textContent = `${Math.floor(cur/60)}:${String(Math.floor(cur%60)).padStart(2,'0')} / ${Math.floor(dur/60)}:${String(Math.floor(dur%60)).padStart(2,'0')}`;
});

// ============================================================================
// RELÓGIO, UF LOCAL (SEM AMERICA/SAO_PAULO), CLIMA & LETREIRO RSS
// ============================================================================

// ============================================================================
// RELÓGIO, UF LOCAL (SEM AMERICA/SAO_PAULO), CLIMA & LETREIRO RSS
// ============================================================================
function initClockAndWeather() {
  const updateClock = () => {
    const now = new Date();
    const h = now.getHours();
    const greet = h < 12 ? "BOM DIA" : h < 18 ? "BOA TARDE" : "BOA NOITE";
    const firstName = (currentUser?.name || "").split(" ")[0].toUpperCase();
    document.getElementById("greetingText").textContent = `${greet}, ${firstName}!`;
    const mcbGreet = document.getElementById("mcbGreet");
    if (mcbGreet) mcbGreet.textContent = `${greet}, ${firstName}! • ${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
    document.getElementById("liveClockText").textContent = now.toLocaleTimeString("pt-BR");
    document.getElementById("liveDateText").textContent = now.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
  };
  updateClock();
  setInterval(updateClock, 1000);

  // UF por fuso/geolocalização sem nunca exibir America/Sao_Paulo
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const ufMap = {
    "America/Sao_Paulo": "SP",
    "America/Fortaleza": "CE",
    "America/Recife": "PE",
    "America/Bahia": "BA",
    "America/Manaus": "AM",
    "America/Belem": "PA",
    "America/Cuiaba": "MT",
    "America/Campo_Grande": "MS"
  };
  const uf = ufMap[tz] || "SP";
  document.getElementById("localUfBadge").textContent = uf;
  const mcbUf = document.getElementById("mcbUf");
  if (mcbUf) mcbUf.textContent = uf;

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const wRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`
          );
          const wData = await wRes.json();
          const temp = Math.round(wData.current.temperature_2m);
          const code = wData.current.weather_code;
          const icon = code >= 51 ? "🌧️" : code >= 2 ? "⛅" : "☀️";
          document.getElementById("localWeatherBadge").textContent = `${icon} ${temp}°C`;
          const mcbW = document.getElementById("mcbWeather");
          if (mcbW) mcbW.textContent = `${icon} ${temp}°C`;
        } catch (_) {}
      },
      () => {
        document.getElementById("localWeatherBadge").textContent = "⛅ 24°C";
        const mcbW = document.getElementById("mcbWeather");
        if (mcbW) mcbW.textContent = "⛅ 24°C";
      },
      { timeout: 5000 }
    );
  }
}

async function initRssTicker() {
  const feeds = [
    { url: "https://g1.globo.com/rss/g1/economia/", name: "G1 Economia" },
    { url: "https://g1.globo.com/rss/g1/brasil/", name: "G1 Brasil" },
    { url: "https://g1.globo.com/rss/g1/tecnologia/", name: "G1 Tecnologia" }
  ];

  try {
    const loaded = [];
    for (const f of feeds) {
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}`);
      const json = await res.json();
      if (json.status === "ok" && Array.isArray(json.items)) {
        json.items.slice(0, 10).forEach((item) => {
          loaded.push({ title: item.title, source: f.name, url: item.link });
        });
      }
    }
    if (loaded.length > 0) rssHeadlines = loaded;
  } catch (_) {}

  const renderHeadline = () => {
    const item = rssHeadlines[rssIndex % rssHeadlines.length];
    const link = document.getElementById("rssHeadlineLink");
    link.textContent = item.title;
    link.href = item.url;
    document.getElementById("rssMetaText").textContent = `${item.source} • Tempo Real • Manchete ${(rssIndex % rssHeadlines.length) + 1} de ${rssHeadlines.length}`;
  };

  renderHeadline();
  setInterval(() => {
    if (!rssPaused) {
      rssIndex = (rssIndex + 1) % rssHeadlines.length;
      renderHeadline();
    }
  }, 6000);

  document.getElementById("rssPrevBtn").addEventListener("click", () => {
    rssIndex = (rssIndex - 1 + rssHeadlines.length) % rssHeadlines.length;
    renderHeadline();
  });
  document.getElementById("rssNextBtn").addEventListener("click", () => {
    rssIndex = (rssIndex + 1) % rssHeadlines.length;
    renderHeadline();
  });
  document.getElementById("rssPauseBtn").addEventListener("click", (e) => {
    rssPaused = !rssPaused;
    e.target.textContent = rssPaused ? "▶" : "❚❚";
  });
}

// Fechamento de modais & busca
document.getElementById("closeProfileModalBtn").addEventListener("click", () => document.getElementById("profileModal").classList.add("hidden"));
document.getElementById("closeReadModalBtn").addEventListener("click", () => document.getElementById("readModal").classList.add("hidden"));
document.getElementById("closeAuthorCardBtn").addEventListener("click", () => document.getElementById("authorCardModal").classList.add("hidden"));
document.getElementById("closeCientesModalBtn").addEventListener("click", () => document.getElementById("cientesModal").classList.add("hidden"));

document.getElementById("searchPostsInput").addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  renderFeed();
});

// ===== BOTTOM NAV (mobile) =====
document.getElementById("bnMural")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
document.getElementById("bnNewPost")?.addEventListener("click", openNewPostModal);
document.getElementById("bnProfile")?.addEventListener("click", () => {
  document.getElementById("openProfileModalBtn")?.click();
});
document.getElementById("bnAdmin")?.addEventListener("click", () => {
  document.getElementById("navAdminBtn")?.click();
});
document.getElementById("bnVoice")?.addEventListener("click", () => {
  document.getElementById("voiceModal")?.classList.remove("hidden");
  renderVoiceUI();
});
document.getElementById("closeVoiceModalBtn")?.addEventListener("click", () => {
  document.getElementById("voiceModal")?.classList.add("hidden");
});

document.getElementById("voicePlayAllBtn")?.addEventListener("click", playAllVoice);
document.getElementById("voiceModalPlayAll")?.addEventListener("click", () => {
  playAllVoice();
  document.getElementById("voiceModal")?.classList.add("hidden");
});

// Gravador
let voiceSelectedTag = "☕ Bom dia";
let voiceChunks = [];
let voiceRecorder = null;
let voiceTimerInterval = null;
let voiceSeconds = 0;
let voiceBlob = null;
let voiceMime = "";

function supportedVoiceMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

document.querySelectorAll(".voice-tag-btn").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".voice-tag-btn").forEach((x) => x.classList.remove("bg-indigo-100", "text-[#4f46e5]"));
    b.classList.add("bg-indigo-100", "text-[#4f46e5]");
    voiceSelectedTag = b.dataset.tag;
  });
});
// default select first tag
const firstTag = document.querySelector(".voice-tag-btn");
if (firstTag) firstTag.classList.add("bg-indigo-100", "text-[#4f46e5]");

document.getElementById("voiceRecordBtn")?.addEventListener("click", () => {
  document.getElementById("voiceRecorderModal")?.classList.remove("hidden");
});
document.getElementById("voiceModalRecord")?.addEventListener("click", () => {
  document.getElementById("voiceModal")?.classList.add("hidden");
  document.getElementById("voiceRecorderModal")?.classList.remove("hidden");
});
document.getElementById("voiceCancelRecBtn")?.addEventListener("click", () => {
  if (voiceRecorder && voiceRecorder.state !== "inactive") voiceRecorder.stop();
  clearInterval(voiceTimerInterval);
  document.getElementById("voiceRecorderModal")?.classList.add("hidden");
  document.getElementById("voicePreviewBox")?.classList.add("hidden");
  document.getElementById("voicePublishRecBtn")?.classList.add("hidden");
  document.getElementById("voiceRecHint").textContent = "Toque no botão vermelho para gravar.";
  document.getElementById("voiceRecorderStatus").textContent = "20";
});

document.getElementById("voiceStartRecBtn")?.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceMime = supportedVoiceMime();
    voiceChunks = [];
    voiceRecorder = new MediaRecorder(stream, voiceMime ? { mimeType: voiceMime } : undefined);
    voiceRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) voiceChunks.push(e.data); };
    voiceRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      voiceBlob = new Blob(voiceChunks, { type: voiceMime || "audio/webm" });
      const url = URL.createObjectURL(voiceBlob);
      const audio = document.getElementById("voicePreviewAudio");
      audio.src = url;
      document.getElementById("voicePreviewBox").classList.remove("hidden");
      document.getElementById("voicePublishRecBtn").classList.remove("hidden");
      document.getElementById("voiceRecHint").textContent = "Ouça o preview e publique ou grave de novo.";
    };
    voiceSeconds = 20;
    document.getElementById("voiceRecorderStatus").textContent = voiceSeconds;
    document.getElementById("voiceStartRecBtn").classList.add("hidden");
    document.getElementById("voiceStopRecBtn").classList.remove("hidden");
    document.getElementById("voiceRecHint").textContent = "Gravando...";
    voiceRecorder.start();
    voiceTimerInterval = setInterval(() => {
      voiceSeconds--;
      document.getElementById("voiceRecorderStatus").textContent = voiceSeconds;
      if (voiceSeconds <= 0) {
        document.getElementById("voiceStopRecBtn")?.click();
      }
    }, 1000);
  } catch (err) {
    alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
  }
});

document.getElementById("voiceStopRecBtn")?.addEventListener("click", () => {
  if (voiceRecorder && voiceRecorder.state !== "inactive") voiceRecorder.stop();
  clearInterval(voiceTimerInterval);
  document.getElementById("voiceStartRecBtn").classList.remove("hidden");
  document.getElementById("voiceStopRecBtn").classList.add("hidden");
  document.getElementById("voiceRecHint").textContent = "Processando...";
});

document.getElementById("voicePublishRecBtn")?.addEventListener("click", async () => {
  if (!voiceBlob) return;
  const btn = document.getElementById("voicePublishRecBtn");
  btn.disabled = true;
  btn.textContent = "Publicando...";
  try {
    const ext = (voiceMime || "").includes("mp4") ? "m4a" : "webm";
    const path = `recados_voz/${currentUser.uid}_${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, voiceBlob);
    const audioUrl = await getDownloadURL(storageRef);
    const dur = 20 - voiceSeconds;
    await addDoc(collection(db, "recados_voz"), {
      autorUid: currentUser.uid,
      autorNome: currentUser.name,
      autorFoto: currentUser.avatarUrl,
      autorBase: currentUser.base,
      tag: voiceSelectedTag,
      duracao: dur > 0 ? dur : 20,
      audioUrl,
      storagePath: path,
      reacoes: { risos: 0, fogo: 0, palmas: 0 },
      createdAt: serverTimestamp(),
      createdAtMs: Date.now()
    });
    // reset
    voiceBlob = null;
    document.getElementById("voicePreviewBox").classList.add("hidden");
    btn.classList.add("hidden");
    btn.disabled = false;
    btn.textContent = "Publicar Recado";
    document.getElementById("voiceRecorderModal").classList.add("hidden");
    document.getElementById("voiceRecHint").textContent = "Toque no botão vermelho para gravar.";
    document.getElementById("voiceRecorderStatus").textContent = "20";
  } catch (err) {
    console.error(err);
    alert("Erro ao publicar recado. Verifique as regras do Storage.");
    btn.disabled = false;
    btn.textContent = "Publicar Recado";
  }
});

// (modal de rádio removido — substituído por Voz da Galera)

// Inicializar
initGate();