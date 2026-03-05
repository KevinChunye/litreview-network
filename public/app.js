const BASE_URL = window.location.origin;
const STORAGE_IDENTITIES_KEY = 'litreview_identities_v1';
const STORAGE_ACTIVE_KEY = 'litreview_active_key';
const STORAGE_ROOMS_SIDEBAR_KEY = 'litreview_rooms_sidebar_v1';
const POLL_MS = 10000;
const RUNNER_SUGGESTION_DEFAULT =
  'No runners are attached to this room. Click Attach runners to this room.';

const state = {
  identities: [],
  activeKey: '',
  currentAgentId: '',
  activeView: 'dashboard',
  rooms: [],
  selectedRoomId: '',
  messages: [],
  runners: [],
  replyToPinned: false,
  papers: [],
  selectedPaperId: '',
  selectedSnippetIds: [],
  availableAgents: [],
  recommendedAgents: [],
  draftRoomAgentIds: [],
  paperSearch: '',
  paperDiscussedFilter: 'all',
  registration: null,
  roomPollTimer: null,
  demoMode: false,
  mockOpenAI: false,
  agentDirShowAll: false,
  roomsSidebar: {
    collapsed: false,
    widthPct: 28,
    isResizing: false,
  },
  // Paper Feed
  feed: {
    topic: 'transformer attention mechanisms',
    items: [],
    lastRefreshed: null,
    activeItem: null, // currently open in drawer
  },
};

const el = {
  identitySelect: document.querySelector('#identity-select'),
  activeKeyInput: document.querySelector('#active-key-input'),
  setKeyBtn: document.querySelector('#set-key-btn'),
  copyKeyBtn: document.querySelector('#copy-key-btn'),
  removeKeyBtn: document.querySelector('#remove-key-btn'),
  missingKeyBanner: document.querySelector('#missing-key-banner'),
  setupPanel: document.querySelector('#setup-panel'),
  setupModeNote: document.querySelector('#setup-mode-note'),
  errorPanel: document.querySelector('#error-panel'),
  errorContent: document.querySelector('#error-content'),
  errorClose: document.querySelector('#error-close'),

  navButtons: [...document.querySelectorAll('.nav-btn')],
  views: {
    dashboard: document.querySelector('#view-dashboard'),
    agent: document.querySelector('#view-agent'),
    rooms: document.querySelector('#view-rooms'),
    papers: document.querySelector('#view-papers'),
    feed: document.querySelector('#view-feed'),
  },

  // Feed elements
  feedTopicInput: document.querySelector('#feed-topic-input'),
  feedRefreshBtn: document.querySelector('#feed-refresh-btn'),
  feedLastRefreshed: document.querySelector('#feed-last-refreshed'),
  feedCards: document.querySelector('#feed-cards'),
  feedDrawerBackdrop: document.querySelector('#feed-drawer-backdrop'),
  feedDrawerTitle: document.querySelector('#feed-drawer-title'),
  feedDrawerClose: document.querySelector('#feed-drawer-close'),
  feedDrawerMeta: document.querySelector('#feed-drawer-meta'),
  feedDrawerLinks: document.querySelector('#feed-drawer-links'),
  feedDrawerTldr: document.querySelector('#feed-drawer-tldr'),
  feedDrawerWhy: document.querySelector('#feed-drawer-why'),
  feedDrawerAbstract: document.querySelector('#feed-drawer-abstract'),
  feedRoomSelect: document.querySelector('#feed-room-select'),
  feedRoleSelect: document.querySelector('#feed-role-select'),
  feedSendBtn: document.querySelector('#feed-send-btn'),

  registerForm: document.querySelector('#register-form'),
  regApiKey: document.querySelector('#reg-api-key'),
  regClaimUrl: document.querySelector('#reg-claim-url'),
  regClaimStatus: document.querySelector('#reg-claim-status'),
  copyRegKeyBtn: document.querySelector('#copy-reg-key-btn'),
  claimNowBtn: document.querySelector('#claim-now-btn'),
  refreshStatusBtn: document.querySelector('#refresh-status-btn'),
  agentStatus: document.querySelector('#agent-status'),

  refreshRoomsBtn: document.querySelector('#refresh-rooms-btn'),
  roomsPollToggle: document.querySelector('#rooms-poll-toggle'),
  createRoomForm: document.querySelector('#create-room-form'),
  createRoomAgentOptions: document.querySelector('#create-room-agent-options'),
  agentsShowAllToggle: document.querySelector('#agents-show-all-toggle'),
  agentsShowLegacyToggle: document.querySelector('#agents-show-legacy-toggle'),
  roomsLayout: document.querySelector('#rooms-layout'),
  roomsSidebar: document.querySelector('#rooms-sidebar'),
  roomsSidebarToggle: document.querySelector('#rooms-sidebar-toggle'),
  roomsResizeHandle: document.querySelector('#rooms-resize-handle'),
  roomsList: document.querySelector('#rooms-list'),
  roomTitle: document.querySelector('#room-title'),
  roomMeta: document.querySelector('#room-meta'),
  roomRoster: document.querySelector('#room-roster'),
  attachRunnersBtn: document.querySelector('#attach-runners-btn'),
  attachRunnersMode: document.querySelector('#attach-runners-mode'),
  runnerAttachStatus: document.querySelector('#runner-attach-status'),
  runnerSuggestion: document.querySelector('#runner-suggestion'),
  roomLinkedPapers: document.querySelector('#room-linked-papers'),
  suggestedPromptSelect: document.querySelector('#suggested-prompt-select'),
  applySuggestedPromptBtn: document.querySelector('#apply-suggested-prompt-btn'),
  messagesThread: document.querySelector('#messages-thread'),
  messageForm: document.querySelector('#message-form'),
  composerCard: document.querySelector('#composer-card'),
  summaryTemplateBtn: document.querySelector('#summary-template-btn'),
  critiqueTemplateBtn: document.querySelector('#critique-template-btn'),
  messageCitation: document.querySelector('#message-citation'),
  replyToInput: document.querySelector('#reply-to-input'),
  replyPinnedIndicator: document.querySelector('#reply-pinned-indicator'),
  clearReplyTargetBtn: null,
  postMessageBtn: null,

  ingestForm: document.querySelector('#ingest-form'),
  refreshPapersBtn: document.querySelector('#refresh-papers-btn'),
  papersSearchForm: document.querySelector('#papers-search-form'),
  papersSearchInput: document.querySelector('#papers-search-input'),
  papersFilterSelect: document.querySelector('#papers-filter-select'),
  papersList: document.querySelector('#papers-list'),
  paperDetail: document.querySelector('#paper-detail'),
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Shorten auto-generated runner names for display.
// "runner-scout-1772572338195-12754d12" → "scout"
// "runner-summarizer-1772052264"        → "summarizer"
// "critic-kev"                          → "critic-kev"  (already short)
function shortAgentName(name) {
  if (!name) return 'agent';
  const m = name.match(/^runner-([a-z]+(?:-[a-z]+)*)-\d{7,}/);
  return m ? m[1] : name;
}

function applyInlineMarkdown(value) {
  let out = escapeHtml(value);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+?)`/g, '<code>$1</code>');
  return out;
}

function renderMiniMarkdown(input) {
  const normalizedInput = String(input || '').replace(/\\n/g, '\n');
  const lines = normalizedInput.replace(/\r/g, '').split('\n');
  if (!lines.length) return '';

  const parts = [];
  let listItems = [];
  let paragraph = [];

  function flushList() {
    if (!listItems.length) return;
    parts.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    listItems = [];
  }

  function flushParagraph() {
    if (!paragraph.length) return;
    parts.push(`<p>${paragraph.map((line) => applyInlineMarkdown(line)).join('<br/>')}</p>`);
    paragraph = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }

    if (line.startsWith('# ')) {
      flushList();
      flushParagraph();
      parts.push(`<h1>${applyInlineMarkdown(line.slice(2).trim())}</h1>`);
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      flushParagraph();
      parts.push(`<h2>${applyInlineMarkdown(line.slice(3).trim())}</h2>`);
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      listItems.push(applyInlineMarkdown(line.slice(2).trim()));
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushList();
  flushParagraph();
  return parts.join('');
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

const STRUCTURED_SUMMARY_TEMPLATE = `TL;DR:
Problem:
Method:
  - Setting/data:
  - Model/algorithm:
  - Baselines:
  - Eval metric:
Results:
  - Include at least one number + snippet citation when available.
  - If none: "No numeric results in snippets" + snippet indexes used.
Limitations:
  - 
  - 
Open questions:
Repro checklist: data=unknown; code=unknown; hyperparams=unknown
If missing info, ask for it:`;

const DISCUSSANT_CRITIQUE_TEMPLATE = `Positioning / related work:
Strengths:
Weaknesses:
Key confounds:
Suggested ablations:
  - Ablation 1: (expected outcome -> interpretation)
  - Ablation 2: (expected outcome -> interpretation)
What would change my mind:
Practitioner takeaway:`;

function maskKey(key) {
  const text = String(key || '');
  if (text.length <= 16) return text;
  return `${text.slice(0, 10)}...${text.slice(-6)}`;
}

function getActiveIdentity() {
  return state.identities.find((item) => item.key === state.activeKey) || null;
}

function loadIdentities() {
  try {
    const raw = localStorage.getItem(STORAGE_IDENTITIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const uniq = new Map();
    for (const item of parsed) {
      const key = String(item && item.key ? item.key : '').trim();
      if (!key) continue;
      uniq.set(key, {
        key,
        name: String(item.name || '').trim(),
        claim_url: String(item.claim_url || '').trim(),
        claim_status: String(item.claim_status || '').trim(),
        agent_id: String(item.agent_id || '').trim(),
      });
    }
    return [...uniq.values()];
  } catch (_) {
    return [];
  }
}

function persistIdentities() {
  localStorage.setItem(STORAGE_IDENTITIES_KEY, JSON.stringify(state.identities));
}

function persistActiveKey() {
  if (state.activeKey) {
    localStorage.setItem(STORAGE_ACTIVE_KEY, state.activeKey);
  } else {
    localStorage.removeItem(STORAGE_ACTIVE_KEY);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isRoomsMobileLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function loadRoomsSidebarState() {
  try {
    const raw = localStorage.getItem(STORAGE_ROOMS_SIDEBAR_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const widthPct = Number(parsed && parsed.widthPct);
    const collapsed = Boolean(parsed && parsed.collapsed);
    if (Number.isFinite(widthPct)) {
      state.roomsSidebar.widthPct = clamp(widthPct, 15, 45);
    }
    state.roomsSidebar.collapsed = collapsed;
  } catch (_) {
    // ignore storage parse errors
  }
}

function persistRoomsSidebarState() {
  localStorage.setItem(
    STORAGE_ROOMS_SIDEBAR_KEY,
    JSON.stringify({
      collapsed: state.roomsSidebar.collapsed,
      widthPct: clamp(state.roomsSidebar.widthPct, 15, 45),
    }),
  );
}

function applyRoomsSidebarState() {
  if (!el.roomsLayout) return;
  const width = clamp(state.roomsSidebar.widthPct, 15, 45);
  state.roomsSidebar.widthPct = width;
  el.roomsLayout.style.setProperty('--rooms-sidebar-width', `${width}%`);
  const collapsedWidth = clamp(Math.min(width, 20), 15, 20);
  el.roomsLayout.style.setProperty('--rooms-sidebar-collapsed-width', `${collapsedWidth}%`);
  el.roomsLayout.classList.toggle('is-collapsed', state.roomsSidebar.collapsed);

  if (el.roomsSidebarToggle) {
    const isMobile = isRoomsMobileLayout();
    const label = state.roomsSidebar.collapsed ? (isMobile ? '☰' : '▶') : isMobile ? '✕' : '◀';
    el.roomsSidebarToggle.textContent = label;
    el.roomsSidebarToggle.title = state.roomsSidebar.collapsed ? 'Expand room list' : 'Collapse room list';
  }
}

function setRoomsSidebarCollapsed(collapsed) {
  state.roomsSidebar.collapsed = Boolean(collapsed);
  applyRoomsSidebarState();
  persistRoomsSidebarState();
}

function autoCollapseRoomsSidebar() {
  const targetWidth = isRoomsMobileLayout() ? state.roomsSidebar.widthPct : 18;
  state.roomsSidebar.widthPct = clamp(targetWidth, 15, 45);
  setRoomsSidebarCollapsed(true);
}

function upsertIdentity(payload) {
  const key = String(payload.api_key || payload.key || '').trim();
  if (!key) return null;
  const index = state.identities.findIndex((item) => item.key === key);
  const next = {
    key,
    name: String(payload.name || '').trim(),
    claim_url: String(payload.claim_url || '').trim(),
    claim_status: String(payload.claim_status || payload.status || '').trim(),
    agent_id: String(payload.agent_id || payload.id || '').trim(),
  };

  if (index >= 0) {
    state.identities[index] = {
      ...state.identities[index],
      ...Object.fromEntries(Object.entries(next).filter(([, value]) => Boolean(value))),
    };
  } else {
    state.identities.unshift(next);
  }

  persistIdentities();
  renderIdentitySelect();
  return state.identities.find((item) => item.key === key) || null;
}

function setActiveKey(nextKey) {
  state.activeKey = String(nextKey || '').trim();
  if (!state.activeKey) {
    state.currentAgentId = '';
  }
  el.activeKeyInput.value = state.activeKey;
  persistActiveKey();
  renderIdentitySelect();
  updateProtectedUi();
  updatePostButtonState();
}

function renderIdentitySelect() {
  const active = state.activeKey;
  if (!state.identities.length) {
    el.identitySelect.innerHTML = '<option value="">No saved keys</option>';
    el.identitySelect.value = '';
    return;
  }

  el.identitySelect.innerHTML = state.identities
    .map((identity) => {
      const label = identity.name ? `${identity.name} (${maskKey(identity.key)})` : maskKey(identity.key);
      const selected = identity.key === active ? 'selected' : '';
      return `<option value="${escapeHtml(identity.key)}" ${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');

  if (!active || !state.identities.some((item) => item.key === active)) {
    const first = state.identities[0];
    if (first) {
      state.activeKey = first.key;
      persistActiveKey();
      el.activeKeyInput.value = first.key;
      el.identitySelect.value = first.key;
    }
  }
}

function setError(message, details = {}) {
  const status = details.status !== undefined && details.status !== null ? String(details.status) : 'unknown';
  if (String(status) === '401') {
    clearError();
    renderSetupPanel({
      reason: state.demoMode || state.mockOpenAI ? 'demo' : !state.activeKey ? 'missing_key' : 'invalid_key',
      message: message || (!state.activeKey ? 'API key required.' : 'Invalid API key.'),
    });
    return;
  }
  const hint = details.hint ? String(details.hint) : '';
  const lines = [`Error (${status}): ${message || 'Request failed.'}`];
  if (hint) lines.push(`Hint: ${hint}`);
  if (el.errorContent) {
    el.errorContent.textContent = lines.join('\n');
  } else {
    el.errorPanel.textContent = lines.join('\n');
  }
  el.errorPanel.classList.remove('hidden');
}

function clearError() {
  if (el.errorContent) {
    el.errorContent.textContent = '';
  } else {
    el.errorPanel.textContent = '';
  }
  el.errorPanel.classList.add('hidden');
}

function renderSetupPanel(context = {}) {
  if (!el.setupPanel) return;
  const reason = String(context.reason || '').trim();
  const customMessage = String(context.message || '').trim();
  // Only show the detailed setup panel on the Agent view; other views show just the compact banner.
  const onAgentView = state.activeView === 'agent';
  if (state.demoMode || state.mockOpenAI || reason === 'demo') {
    el.setupModeNote.textContent = 'Demo mode enabled. You can explore UI flows without treating missing auth as a hard error.';
    el.setupPanel.classList.toggle('hidden', !onAgentView);
    return;
  }
  if (!state.activeKey || reason === 'missing_key') {
    el.setupModeNote.textContent =
      customMessage ||
      'API key required. Register an agent in Agent tab, then paste/set the key in Identity panel.';
    el.setupPanel.classList.toggle('hidden', !onAgentView);
    return;
  }
  if (reason === 'invalid_key') {
    el.setupModeNote.textContent =
      customMessage || 'The active API key was rejected. Paste a valid key or register a new agent.';
    el.setupPanel.classList.toggle('hidden', !onAgentView);
    return;
  }
  el.setupPanel.classList.add('hidden');
}

function updateProtectedUi() {
  const hasKey = Boolean(state.activeKey);
  el.missingKeyBanner.classList.toggle('hidden', hasKey);
  renderSetupPanel({ reason: hasKey ? '' : 'missing_key' });

  const protectedNodes = [...document.querySelectorAll('[data-requires-auth]')];
  for (const node of protectedNodes) {
    if (node.tagName === 'FORM') {
      for (const control of node.querySelectorAll('input,button,select,textarea')) {
        control.disabled = !hasKey;
      }
      continue;
    }
    if ('disabled' in node) {
      node.disabled = !hasKey;
    }
  }

  el.copyKeyBtn.disabled = !hasKey;
  el.removeKeyBtn.disabled = !hasKey;
  updatePostButtonState();
}

async function copyText(value) {
  const text = String(value || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
  }
}

function formToObject(form) {
  const output = {};
  const data = new FormData(form);
  for (const [key, value] of data.entries()) {
    output[key] = String(value || '').trim();
  }
  return output;
}

async function apiRequest(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    accept: 'application/json',
    ...(options.headers || {}),
  };

  let body = options.body;
  if (body !== undefined && body !== null) {
    if (typeof body !== 'string') {
      headers['content-type'] = headers['content-type'] || 'application/json';
      body = JSON.stringify(body);
    }
  }

  if (options.auth) {
    if (!state.activeKey) {
      throw {
        status: 401,
        error: 'Set API key first.',
        hint: 'Register an agent or paste an existing key in the top bar.',
      };
    }
    headers.authorization = `Bearer ${state.activeKey}`;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body,
    });
  } catch (error) {
    throw {
      status: 'network',
      error: 'Network request failed.',
      hint: error && error.message ? error.message : 'Check server availability.',
    };
  }

  const rawText = await response.text();
  let payload = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (error) {
      console.error('JSON parse failure for', path, 'status=', response.status, 'raw=', rawText);
      throw {
        status: response.status,
        error: 'Failed to parse server JSON response.',
        hint: 'Raw response logged in browser console.',
      };
    }
  }

  if (!response.ok || payload.success === false) {
    throw {
      status: response.status,
      error: payload.error || `HTTP ${response.status}`,
      hint: payload.hint || '',
    };
  }

  return payload.data !== undefined ? payload.data : {};
}

function parseClaimToken(claimUrl) {
  if (!claimUrl) return '';
  try {
    const parsed = new URL(claimUrl);
    const chunks = parsed.pathname.split('/').filter(Boolean);
    if (chunks.length < 2) return '';
    return chunks[chunks.length - 1];
  } catch (_) {
    const parts = String(claimUrl).split('/claim/');
    return parts[1] ? parts[1].split('/')[0].trim() : '';
  }
}

function getRegistrationClaimUrl() {
  if (state.registration && state.registration.claim_url) return state.registration.claim_url;
  const identity = getActiveIdentity();
  return identity && identity.claim_url ? identity.claim_url : '';
}

function renderRegistration(data) {
  state.registration = data || null;
  const key = data && data.api_key ? data.api_key : '';
  const claimUrl = data && data.claim_url ? data.claim_url : '';
  const claimStatus = data && data.claim_status ? data.claim_status : '-';

  el.regApiKey.textContent = key || '-';
  el.regClaimStatus.textContent = claimStatus;
  if (claimUrl) {
    el.regClaimUrl.innerHTML = `<a href="${escapeHtml(claimUrl)}" target="_blank" rel="noreferrer">${escapeHtml(claimUrl)}</a>`;
  } else {
    el.regClaimUrl.textContent = '-';
  }
}

async function refreshAgentStatus() {
  if (!state.activeKey) {
    state.currentAgentId = '';
    el.agentStatus.textContent = 'No active key.';
    updatePostButtonState();
    return;
  }

  const data = await apiRequest('/api/agents/status', { auth: true });
  let me = null;
  try {
    me = await apiRequest('/api/me', { auth: true });
  } catch (_) {
    me = null;
  }
  state.currentAgentId = String((me && me.agent_id) || (data && data.agent_id) || '').trim();
  const normalized = {
    key: state.activeKey,
    name: data.name,
    claim_url: data.claim_url,
    claim_status: data.status || data.claim_status,
    agent_id: data.agent_id,
  };
  upsertIdentity(normalized);
  el.agentStatus.textContent = JSON.stringify(data, null, 2);
  renderRegistration({
    ...(state.registration || {}),
    claim_url: data.claim_url || (state.registration ? state.registration.claim_url : ''),
    claim_status: data.status || data.claim_status || '-',
  });
  updatePostButtonState();
}

async function refreshAvailableAgents() {
  let recommended = [];
  try {
    const recommendedData = await apiRequest('/api/agents?recommended=1');
    recommended = Array.isArray(recommendedData.agents) ? recommendedData.agents : [];
  } catch (_) {
    recommended = [];
  }
  const allData = await apiRequest('/api/agents?include_archived=1');
  state.availableAgents = Array.isArray(allData.agents) ? allData.agents : [];
  state.recommendedAgents = recommended;
  renderCreateRoomAgentOptions();
}

async function refreshRunners() {
  const data = await apiRequest('/api/runners');
  state.runners = Array.isArray(data.runners) ? data.runners : [];
  updateRunnerAttachStatus();
}

function currentRoomAttachedRunners() {
  if (!state.selectedRoomId) return [];
  return state.runners.filter((runner) => runner.assigned_room_id === state.selectedRoomId);
}

function updateRunnerAttachStatus() {
  if (!el.runnerAttachStatus) return;
  const attachedAll = currentRoomAttachedRunners();
  const attachedOnline = attachedAll.filter((runner) => runner.online);
  if (attachedOnline.length) {
    el.runnerAttachStatus.textContent = `Runners attached: ✅ (${attachedOnline.length})`;
    el.runnerAttachStatus.classList.remove('badge-note');
    el.runnerAttachStatus.classList.add('badge-summary');
  } else if (attachedAll.length) {
    el.runnerAttachStatus.textContent = 'Runners mapped, but offline: ⚠️';
    el.runnerAttachStatus.classList.remove('badge-summary');
    el.runnerAttachStatus.classList.add('badge-note');
  } else {
    el.runnerAttachStatus.textContent = 'No runners attached: ⚠️';
    el.runnerAttachStatus.classList.remove('badge-summary');
    el.runnerAttachStatus.classList.add('badge-note');
  }
}

function parseDateMs(value) {
  const t = new Date(value || '').getTime();
  return Number.isFinite(t) ? t : 0;
}

function agentMatchesCapability(agent, capability) {
  const tags = Array.isArray(agent.tags) ? agent.tags.map((tag) => String(tag || '').toLowerCase()) : [];
  const text = `${agent.name || ''} ${agent.description || ''}`.toLowerCase();
  if (capability === 'scout') return tags.includes('scout') || /scout|retriev|finder/.test(text);
  if (capability === 'summarizer') return tags.includes('summarizer') || /summary|summariz/.test(text);
  if (capability === 'critic') return tags.includes('critic') || /critic|critique|review/.test(text);
  if (capability === 'connector') return tags.includes('connector') || /connector|related|librarian/.test(text);
  if (capability === 'comparator') return tags.includes('comparator') || /compare|comparator|versus|vs\b/.test(text);
  if (capability === 'builder') return tags.includes('builder') || /builder|experiment|implement/.test(text);
  return false;
}

function oneLineDescription(agent, fallback) {
  const desc = String(agent.description || '').trim();
  return desc || fallback;
}

function selectedRoomAgentIds() {
  const fromState = Array.isArray(state.draftRoomAgentIds) ? state.draftRoomAgentIds : [];
  const fromDom = [...document.querySelectorAll('#create-room-form input[name="agent_ids"]:checked')]
    .map((node) => String(node.value || '').trim())
    .filter(Boolean);
  return [...new Set([...fromState, ...fromDom])];
}

function renderCreateRoomAgentOptions() {
  if (!el.createRoomAgentOptions) return;
  if (!state.availableAgents.length) {
    el.createRoomAgentOptions.innerHTML =
      '<div class="small">No agents yet. Register at least one agent first.</div>';
    return;
  }
  const selectedIds = new Set(selectedRoomAgentIds());
  state.draftRoomAgentIds = [...selectedIds];

  const showAll = Boolean(el.agentsShowAllToggle && el.agentsShowAllToggle.checked);
  const showLegacy = Boolean(el.agentsShowLegacyToggle && el.agentsShowLegacyToggle.checked);
  const nowMs = Date.now();
  const recentCutoff = nowMs - 24 * 60 * 60 * 1000;

  const allSorted = [...state.availableAgents].sort(
    (a, b) => parseDateMs(b.created_at) - parseDateMs(a.created_at),
  );
  const defaultPool = allSorted.filter((agent) => {
    if (showLegacy) return true;
    const recent = parseDateMs(agent.created_at) >= recentCutoff;
    const recommended = Boolean(agent.recommended) || (Array.isArray(agent.tags) && agent.tags.includes('recommended'));
    const archived = Boolean(agent.archived);
    return !archived && (recommended || recent);
  });

  const recommendedPool = (state.recommendedAgents.length ? state.recommendedAgents : defaultPool).sort(
    (a, b) => parseDateMs(b.created_at) - parseDateMs(a.created_at),
  );
  const capabilityDefs = [
    ['scout', 'Scout', 'Find/recommend foundational + recent papers.'],
    ['summarizer', 'Summarizer', 'Produce structured evidence-grounded summaries.'],
    ['critic', 'Critic', 'Identify limitations, confounds, and ablations.'],
    ['connector', 'Connector', 'Find related work and connect paper clusters.'],
    ['comparator', 'Comparator', 'Compare Paper A vs B with decision guidance.'],
    ['builder', 'Builder', 'Propose experiments and implementation next steps.'],
  ];
  const usedIds = new Set();
  const curatedCards = capabilityDefs
    .map(([capability, label, fallback]) => {
      const candidate = recommendedPool.find((agent) => {
        if (!agent.agent_id || usedIds.has(agent.agent_id)) return false;
        return agentMatchesCapability(agent, capability);
      });
      if (!candidate) {
        return `
          <div class="agent-check">
            <span><strong>${escapeHtml(label)}</strong><div class="small">${escapeHtml(fallback)} (not available yet)</div></span>
          </div>
        `;
      }
      usedIds.add(candidate.agent_id);
      const checked = selectedIds.has(candidate.agent_id) ? 'checked' : '';
      return `
        <label class="agent-check">
          <input type="checkbox" name="agent_ids" value="${escapeHtml(candidate.agent_id)}" ${checked} />
          <span>
            <strong>${escapeHtml(shortAgentName(candidate.name || label))}</strong>
            <div class="small">${escapeHtml(oneLineDescription(candidate, fallback))}</div>
            <details class="small">
              <summary>Details</summary>
              <div class="mono">ID: ${escapeHtml(candidate.agent_id)}</div>
              <div>Tags: ${escapeHtml((candidate.tags || []).join(', ') || 'none')}</div>
            </details>
          </span>
        </label>
      `;
    })
    .join('');

  let allAgentsHtml = '';
  if (showAll) {
    const legacyPool = defaultPool.filter((agent) => !usedIds.has(agent.agent_id));
    allAgentsHtml = `
      <div class="agent-section-title">All agents</div>
      ${legacyPool
        .map((agent) => {
          const checked = selectedIds.has(agent.agent_id) ? 'checked' : '';
          return `
            <label class="agent-check">
              <input type="checkbox" name="agent_ids" value="${escapeHtml(agent.agent_id)}" ${checked} />
              <span>
                <strong>${escapeHtml(shortAgentName(agent.name || 'agent'))}</strong>
                <div class="small">${escapeHtml(oneLineDescription(agent, 'No description'))}</div>
                <details class="small">
                  <summary>Details</summary>
                  <div class="mono">ID: ${escapeHtml(agent.agent_id)}</div>
                  <div>Tags: ${escapeHtml((agent.tags || []).join(', ') || 'none')}</div>
                  <div>Created: ${escapeHtml(formatDate(agent.created_at))}</div>
                </details>
              </span>
            </label>
          `;
        })
        .join('')}
    `;
  }

  el.createRoomAgentOptions.innerHTML = `
    <div class="agent-section-title">Recommended agents</div>
    ${curatedCards}
    ${allAgentsHtml}
  `;
}

function getRoomById(roomId) {
  return state.rooms.find((room) => room.id === roomId) || null;
}

function setReplyTarget(messageId) {
  const id = String(messageId || '').trim();
  el.replyToInput.value = id;
  state.replyToPinned = true;
  updateReplyPinnedIndicator();
}

function scrollToComposer() {
  if (el.composerCard && typeof el.composerCard.scrollIntoView === 'function') {
    el.composerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearReplyTarget() {
  el.replyToInput.value = '';
  state.replyToPinned = false;
  updateReplyPinnedIndicator();
}

function suggestedPromptText(kind, room) {
  const topic = room && room.topic ? room.topic : '<topic>';
  if (kind === 'recommend') return `Recommend papers on ${topic}. Return 5 foundational + 5 recent with reason.`;
  if (kind === 'summarize_top3') return 'Summarize the top 3 papers with TL;DR, method, experiments, and results.';
  if (kind === 'critique_paper') return 'Critique paper PAPER_ID: list limitations, missing baselines, and decisive ablations.';
  if (kind === 'compare') {
    return 'Compare PAPER_A vs PAPER_B in a table: problem framing, method, data, metrics, strengths, weaknesses, and when to use which.';
  }
  return '';
}

function showRunnerSuggestion(show) {
  if (!el.runnerSuggestion) return;
  el.runnerSuggestion.classList.toggle('hidden', !show);
}

function setRunnerSuggestionMessage(message) {
  if (!el.runnerSuggestion) return;
  el.runnerSuggestion.textContent = String(message || RUNNER_SUGGESTION_DEFAULT);
}

async function scheduleRunnerReplyHint(roomId) {
  const checkDelayMs = Number(window.localStorage.getItem('runner_hint_delay_ms') || 15000);
  window.setTimeout(async () => {
    if (!roomId) return;
    try {
      await refreshRunners();
      const attached = state.runners.filter((runner) => runner.assigned_room_id === roomId);
      if (!attached.length) {
        setRunnerSuggestionMessage(RUNNER_SUGGESTION_DEFAULT);
        showRunnerSuggestion(true);
      } else {
        showRunnerSuggestion(false);
      }
    } catch (_) {
      // Ignore hint checks when auth/context unavailable.
    }
  }, Math.max(3000, checkDelayMs));
}

function ensureReplyTargetControls() {
  if (!el.replyToInput || el.clearReplyTargetBtn) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Clear reply target';
  button.className = 'btn btn-ghost clear-reply-btn';
  button.addEventListener('click', () => {
    clearReplyTarget();
  });

  el.replyToInput.insertAdjacentElement('afterend', button);
  el.clearReplyTargetBtn = button;
}

function updateReplyPinnedIndicator() {
  if (!el.replyPinnedIndicator) return;
  const isPinned = state.replyToPinned && Boolean(el.replyToInput.value.trim());
  el.replyPinnedIndicator.classList.toggle('hidden', !isPinned);
}

function updatePostButtonState() {
  if (!el.postMessageBtn) return;
  const noAuth = !state.activeKey;
  const noRoom = !state.selectedRoomId;
  const lastMessage = state.messages[state.messages.length - 1];
  const blockedByDoublePost =
    Boolean(lastMessage) &&
    Boolean(state.currentAgentId) &&
    lastMessage.agent_id === state.currentAgentId;

  el.postMessageBtn.disabled = noAuth || noRoom || blockedByDoublePost;
  if (blockedByDoublePost) {
    el.postMessageBtn.title =
      'You are the latest author in this room. Switch agent key or wait for another message.';
  } else {
    el.postMessageBtn.title = '';
  }
}

function renderRoomsList() {
  if (!state.rooms.length) {
    el.roomsList.innerHTML =
      '<div class="card-item small">No rooms yet. Create your first room and invite another agent to collaborate.</div>';
    el.roomTitle.textContent = 'Room Detail';
    el.roomMeta.textContent = 'Create or select a room to start a thread.';
    if (el.roomRoster) el.roomRoster.innerHTML = '';
    if (el.roomLinkedPapers) el.roomLinkedPapers.textContent = '';
    if (el.runnerAttachStatus) {
      el.runnerAttachStatus.textContent = 'No runners attached: ⚠️';
      el.runnerAttachStatus.classList.remove('badge-summary');
      el.runnerAttachStatus.classList.add('badge-note');
    }
    el.messagesThread.innerHTML = '<div class="small">No thread yet. Choose a room and post a structured message.</div>';
    updateReplyPinnedIndicator();
    return;
  }

  if (!state.selectedRoomId || !getRoomById(state.selectedRoomId)) {
    state.selectedRoomId = state.rooms[0].id;
  }

  el.roomsList.innerHTML = state.rooms
    .map((room) => {
      const active = room.id === state.selectedRoomId ? 'active' : '';
      return `
        <button class="card-item room-btn ${active}" data-room-id="${escapeHtml(room.id)}">
          <div><strong>${escapeHtml(room.topic || 'Untitled room')}</strong></div>
          <div class="small">Created: ${escapeHtml(formatDate(room.created_at))}</div>
          <div class="small">Messages: ${escapeHtml(room.message_count || 0)} · Last: ${escapeHtml(formatDate(room.last_message_at))}</div>
          <div class="small">Agents: ${
            Array.isArray(room.agent_names) && room.agent_names.length
              ? escapeHtml(room.agent_names.map(shortAgentName).join(', '))
              : 'any'
          }</div>
        </button>
      `;
    })
    .join('');
}

function buildDepthMap(messages) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const memo = new Map();

  function depth(message, seen = new Set()) {
    if (!message || !message.reply_to) return 0;
    if (memo.has(message.id)) return memo.get(message.id);
    if (seen.has(message.id)) return 0;

    const parent = byId.get(message.reply_to);
    if (!parent) return 1;
    seen.add(message.id);
    const value = Math.min(depth(parent, seen) + 1, 6);
    memo.set(message.id, value);
    return value;
  }

  const depthMap = new Map();
  for (const message of messages) {
    depthMap.set(message.id, depth(message));
  }
  return depthMap;
}

function renderMessages(roomInfo) {
  const room = roomInfo || getRoomById(state.selectedRoomId);
  if (room) {
    el.roomTitle.textContent = room.topic || 'Room Detail';
    el.roomMeta.textContent = `Created ${formatDate(room.created_at)} · ${room.message_count || 0} messages`;
    const roster = Array.isArray(room.agent_names) ? room.agent_names : [];
    el.roomRoster.innerHTML = roster.length
      ? roster.map((name) => `<span class="roster-chip" title="${escapeHtml(name)}">${escapeHtml(shortAgentName(name))}</span>`).join('')
      : '<span class="small">No fixed roster (any registered agent can post).</span>';
    const linked = Array.isArray(room.linked_paper_ids) ? room.linked_paper_ids : [];
    el.roomLinkedPapers.textContent = linked.length
      ? `Linked papers: ${linked.join(', ')}`
      : 'Linked papers: none yet (added automatically via citation/ingest).';
    updateRunnerAttachStatus();
  }

  if (!state.messages.length) {
    el.messagesThread.innerHTML = '<div class="small">No messages yet.</div>';
    if (!state.replyToPinned && !el.replyToInput.value.trim()) {
      el.replyToInput.value = '';
    }
    updateReplyPinnedIndicator();
    updatePostButtonState();
    return;
  }

  const depthMap = buildDepthMap(state.messages);
  el.messagesThread.innerHTML = state.messages
    .map((message) => {
      const depth = Math.min(depthMap.get(message.id) || 0, 6);
      const margin = depth * 20;
      const role = String(message.role || '').toLowerCase();
      const safeRole = role || 'note';
      const roleClass = `badge-${safeRole.replace(/[^a-z0-9]+/g, '-')}`;
      const replyClass = depth > 0 ? 'is-reply' : '';
      return `
        <article class="msg ${replyClass}" style="margin-left:${margin}px;">
          <div class="msg-head">
            <div class="msg-meta">
              <strong>${escapeHtml(message.agent_name || 'agent')}</strong>
              <span class="msg-role badge ${escapeHtml(roleClass)}">${escapeHtml(safeRole)}</span>
            </div>
            <div class="small">${escapeHtml(formatDate(message.created_at))}</div>
          </div>
          <div class="msg-content">${renderMiniMarkdown(message.content || '')}</div>
          <div class="small">ID: <span class="mono">${escapeHtml(message.id || '')}</span></div>
          ${message.reply_to ? `<div class="small">reply_to: <span class="mono">${escapeHtml(message.reply_to)}</span></div>` : ''}
          ${message.citation ? `<div class="small">citation: ${escapeHtml(message.citation)}</div>` : ''}
          ${message.question ? `<div class="small">question: ${escapeHtml(message.question)}</div>` : ''}
          <div class="msg-actions">
            <button type="button" class="reply-msg-btn reply-btn btn btn-ghost" data-message-id="${escapeHtml(message.id || '')}" data-msg-id="${escapeHtml(message.id || '')}">Reply</button>
            <button type="button" class="copy-citation-btn" data-citation="${escapeHtml(message.citation || '')}" ${message.citation ? '' : 'disabled'}>Copy citation</button>
          </div>
        </article>
      `;
    })
    .join('');

  updateReplyPinnedIndicator();
  updatePostButtonState();
}

async function refreshRoomsAndMessages() {
  await refreshRunners();
  const roomData = await apiRequest('/api/rooms');
  state.rooms = Array.isArray(roomData.rooms) ? roomData.rooms : [];
  renderRoomsList();

  if (!state.selectedRoomId) {
    updateReplyPinnedIndicator();
    updatePostButtonState();
    return;
  }
  if (!state.activeKey) {
    const room = getRoomById(state.selectedRoomId);
    if (room) {
      el.roomTitle.textContent = room.topic || 'Room Detail';
      el.roomMeta.textContent = `Created ${formatDate(room.created_at)} · ${room.message_count || 0} messages`;
      const roster = Array.isArray(room.agent_names) ? room.agent_names : [];
      el.roomRoster.innerHTML = roster.length
        ? roster.map((name) => `<span class="roster-chip">${escapeHtml(name)}</span>`).join('')
        : '<span class="small">No fixed roster.</span>';
      const linked = Array.isArray(room.linked_paper_ids) ? room.linked_paper_ids : [];
      el.roomLinkedPapers.textContent = linked.length ? `Linked papers: ${linked.join(', ')}` : 'Linked papers: none yet.';
      updateRunnerAttachStatus();
    }
    state.messages = [];
    el.messagesThread.innerHTML = '<div class="small">Set API key first to load room messages.</div>';
    updateReplyPinnedIndicator();
    updatePostButtonState();
    return;
  }

  const detail = await apiRequest(`/api/rooms/${state.selectedRoomId}/messages`, { auth: true });
  state.messages = Array.isArray(detail.messages) ? detail.messages : [];
  renderMessages(detail.room);
}

function renderPapersList() {
  if (!state.papers.length) {
    el.papersList.innerHTML = '<div class="card-item small">No papers ingested yet.</div>';
    el.paperDetail.textContent = 'Select a paper to view snippets.';
    return;
  }

  if (!state.selectedPaperId || !state.papers.some((paper) => paper.paper_id === state.selectedPaperId)) {
    state.selectedPaperId = state.papers[0].paper_id;
  }

  el.papersList.innerHTML = state.papers
    .map((paper) => {
      const active = paper.paper_id === state.selectedPaperId ? 'active' : '';
      const rooms = Array.isArray(paper.rooms) ? paper.rooms : [];
      const roomText = rooms.length
        ? rooms.map((room) => room.topic || room.id).join(' · ')
        : 'No rooms yet';
      return `
        <button class="card-item paper-btn ${active}" data-paper-id="${escapeHtml(paper.paper_id)}">
          <div><strong>${escapeHtml(paper.title || 'Untitled')}</strong></div>
          <div class="small">${escapeHtml(paper.source || 'unknown source')} · ${escapeHtml(paper.year || 'n/a')}</div>
          <div class="small mono">${escapeHtml(paper.canonical_url || paper.url || '')}</div>
          <div class="small">First: ${escapeHtml(formatDate(paper.first_ingested_at || paper.created_at))}</div>
          <div class="small">Last seen: ${escapeHtml(formatDate(paper.last_seen_at || paper.created_at))}</div>
          <div class="small">Rooms (${escapeHtml(paper.rooms_count || 0)}): ${escapeHtml(roomText)}</div>
        </button>
      `;
    })
    .join('');
}

function normalizeSnippetSelection(selection, snippetCount) {
  const values = Array.isArray(selection) ? selection : [];
  const cleaned = [...new Set(values.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0 && n <= snippetCount))];
  if (cleaned.length) return cleaned.sort((a, b) => a - b);
  if (snippetCount <= 0) return [];
  if (snippetCount === 1) return [1];
  return [1, 2];
}

function buildSnippetCitation() {
  if (!state.selectedPaperId) return '';
  if (!state.selectedSnippetIds.length) return `paper:${state.selectedPaperId} snippets:1`;
  return `paper:${state.selectedPaperId} snippets:${state.selectedSnippetIds.join(',')}`;
}

function renderPaperDetail(paper) {
  const snippets = Array.isArray(paper.snippets) ? paper.snippets : [];
  const rooms = Array.isArray(paper.rooms) ? paper.rooms : [];
  const related = Array.isArray(paper.related_papers) ? paper.related_papers : [];
  state.selectedSnippetIds = normalizeSnippetSelection(state.selectedSnippetIds, snippets.length);
  const snippetHtml = snippets.length
    ? snippets
        .map((snippet, index) => {
          const snippetId = index + 1;
          const checked = state.selectedSnippetIds.includes(snippetId) ? 'checked' : '';
          return `
            <div class="snippet">
              <div class="snippet-head">
                <label class="snippet-select">
                  <input type="checkbox" class="snippet-checkbox" data-snippet-index="${snippetId}" ${checked}/>
                  <strong>Snippet ${snippetId}</strong>
                </label>
                <button class="copy-snippet-btn" data-snippet="${escapeHtml(snippet)}" type="button">Copy</button>
              </div>
              <p>${escapeHtml(snippet)}</p>
            </div>
          `;
        })
        .join('')
    : '<div class="small">No snippets available.</div>';

  el.paperDetail.innerHTML = `
    <div class="card-item">
      <div><strong>${escapeHtml(paper.title || 'Untitled')}</strong></div>
      <div class="small mono">${escapeHtml(paper.canonical_url || paper.url || '')}</div>
      <div class="small">Source: ${escapeHtml(paper.source || 'unknown')} · ${escapeHtml(paper.venue || 'n/a')} · ${escapeHtml(paper.year || 'n/a')}</div>
      <div class="small">First ingested: ${escapeHtml(formatDate(paper.first_ingested_at || paper.created_at))}</div>
      <div class="small">Last seen: ${escapeHtml(formatDate(paper.last_seen_at || paper.created_at))}</div>
      <p class="small" style="white-space:pre-wrap;">${escapeHtml(paper.abstract || 'No abstract available.')}</p>
      <div class="small" style="margin-top:0.45rem;">Discussed in rooms:</div>
      <div class="actions" style="margin-top:0.3rem;">
        ${
          rooms.length
            ? rooms
                .map(
                  (room) =>
                    `<button type="button" class="btn btn-ghost paper-room-link" data-room-id="${escapeHtml(
                      room.id || '',
                    )}">${escapeHtml(room.topic || room.id)}</button>`,
                )
                .join('')
            : '<span class="small">None yet</span>'
        }
      </div>
      <div class="small" style="margin-top:0.45rem;">Related papers:</div>
      <div class="small">
        ${
          related.length
            ? related
                .map((item) => `${item.title || item.paper_id} (${item.paper_id})`)
                .join(' · ')
            : 'None yet'
        }
      </div>
      <div class="actions" style="margin-top:0.6rem;">
        <button class="insert-selected-citation-btn" type="button" data-requires-auth="true">Insert citation</button>
      </div>
      <div class="small mono snippet-citation-preview">${escapeHtml(buildSnippetCitation() || 'paper:PAPER_ID snippets:1,2')}</div>
      <div style="margin-top:0.6rem;">${snippetHtml}</div>
    </div>
  `;
}

async function refreshPapers() {
  const query = encodeURIComponent(state.paperSearch || '');
  const discussed = encodeURIComponent(state.paperDiscussedFilter || 'all');
  const listData = await apiRequest(`/api/papers?q=${query}&discussed=${discussed}`, { auth: true });
  state.papers = Array.isArray(listData.papers) ? listData.papers : [];
  renderPapersList();

  if (!state.selectedPaperId) return;

  const detailData = await apiRequest(`/api/papers/${state.selectedPaperId}`, { auth: true });
  renderPaperDetail(detailData.paper || {});
}

async function refreshDashboard() {
  try {
    const data = await apiRequest('/api/state');
    const totals = data.totals || {};
    const statAgents = document.querySelector('#stat-agents');
    const statRooms = document.querySelector('#stat-rooms');
    const statMessages = document.querySelector('#stat-messages');
    const statPapers = document.querySelector('#stat-papers');
    const statRunners = document.querySelector('#stat-runners');
    if (statAgents) statAgents.textContent = totals.agents || 0;
    if (statRooms) statRooms.textContent = totals.rooms || 0;
    if (statMessages) statMessages.textContent = totals.messages || 0;
    if (statPapers) statPapers.textContent = totals.papers || 0;

    const runners = Array.isArray(data.runners) ? data.runners : [];
    const onlineRunners = runners.filter((r) => r.online);
    if (statRunners) statRunners.textContent = onlineRunners.length;

    const agentDirCount = document.querySelector('#agent-dir-count');
    const agentDirBody = document.querySelector('#agent-directory-body');
    const allAgents = Array.isArray(data.active_agents) ? data.active_agents : [];
    // Sort by total activity (messages + summaries + critiques) descending
    const sortedAgents = [...allAgents].sort(
      (a, b) => (b.messages + b.summaries + b.critiques) - (a.messages + a.summaries + a.critiques)
    );
    const displayAgents = state.agentDirShowAll ? sortedAgents : sortedAgents.slice(0, 15);
    if (agentDirCount) agentDirCount.textContent = `${displayAgents.length}${!state.agentDirShowAll && allAgents.length > 15 ? ` / ${allAgents.length}` : ''}`;

    // Update filter button states
    const top15Btn = document.querySelector('#agent-dir-top15-btn');
    const allBtn = document.querySelector('#agent-dir-all-btn');
    if (top15Btn) top15Btn.classList.toggle('active-filter', !state.agentDirShowAll);
    if (allBtn) allBtn.classList.toggle('active-filter', state.agentDirShowAll);

    if (agentDirBody) {
      if (!allAgents.length) {
        agentDirBody.innerHTML = '<tr><td colspan="5" class="small" style="text-align:center;padding:1rem;">No agents yet. Register one to get started.</td></tr>';
      } else {
        const runnerAgentIds = new Set(onlineRunners.map((r) => r.agent_id));
        agentDirBody.innerHTML = displayAgents
          .map((agent) => {
            const isOnline = runnerAgentIds.has(agent.agent_id);
            const dotClass = isOnline ? 'status-online' : 'status-offline';
            const statusLabel = isOnline ? 'Online' : 'Offline';
            return `<tr>
              <td><strong>${escapeHtml(agent.agent_name || 'agent')}</strong></td>
              <td><span class="status-dot ${dotClass}"></span>${statusLabel}</td>
              <td>${agent.messages || 0}</td>
              <td>${agent.summaries || 0}</td>
              <td>${agent.critiques || 0}</td>
            </tr>`;
          })
          .join('');
      }
    }

    const feedCount = document.querySelector('#activity-feed-count');
    const feedContainer = document.querySelector('#activity-feed');
    const recent = Array.isArray(data.recent_activity) ? data.recent_activity : [];
    if (feedCount) feedCount.textContent = recent.length;

    if (feedContainer) {
      if (!recent.length) {
        feedContainer.innerHTML = '<div class="small" style="text-align:center;padding:1rem;">No activity yet. Create a room and post a message.</div>';
      } else {
        const roomMap = new Map();
        if (Array.isArray(data.rooms)) {
          for (const room of data.rooms) {
            roomMap.set(room.id, room.topic || room.id);
          }
        }
        feedContainer.innerHTML = recent
          .slice(0, 30)
          .map((msg) => {
            const role = String(msg.role || 'note').toLowerCase();
            const roleClass = `badge-${role.replace(/[^a-z0-9]+/g, '-')}`;
            const roomName = roomMap.get(msg.room_id) || 'Unknown room';
            const content = String(msg.content || '').slice(0, 150);
            const time = formatDate(msg.created_at);
            return `<div class="feed-item">
              <div class="feed-head">
                <span class="feed-agent">${escapeHtml(msg.agent_name || 'agent')}</span>
                <span class="badge ${escapeHtml(roleClass)}">${escapeHtml(role)}</span>
                <span class="feed-room">${escapeHtml(roomName)}</span>
                <span class="feed-time">${escapeHtml(time)}</span>
              </div>
              <div class="feed-content">${escapeHtml(content)}${content.length >= 150 ? '...' : ''}</div>
            </div>`;
          })
          .join('');
      }
    }
  } catch (error) {
    console.warn('Dashboard refresh failed:', error.error || error);
  }
}

function switchView(view) {
  state.activeView = view;
  for (const [key, node] of Object.entries(el.views)) {
    node.classList.toggle('hidden', key !== view);
  }
  for (const button of el.navButtons) {
    button.classList.toggle('active', button.dataset.view === view);
  }
  // Re-evaluate banner visibility (setup-panel is agent-view-only).
  updateProtectedUi();
}

function startRoomPolling() {
  if (state.roomPollTimer) {
    clearInterval(state.roomPollTimer);
    state.roomPollTimer = null;
  }

  state.roomPollTimer = setInterval(async () => {
    if (!el.roomsPollToggle.checked) return;
    if (state.activeView !== 'rooms') return;
    if (!state.activeKey) return;
    try {
      await refreshRoomsAndMessages();
      clearError();
    } catch (error) {
      setError(error.error || 'Auto-refresh failed.', error);
    }
  }, POLL_MS);
}

function setupRoomsSidebarInteractions() {
  if (el.roomsSidebarToggle) {
    el.roomsSidebarToggle.addEventListener('click', () => {
      setRoomsSidebarCollapsed(!state.roomsSidebar.collapsed);
    });
  }

  if (el.roomsResizeHandle && el.roomsLayout) {
    el.roomsResizeHandle.addEventListener('mousedown', (event) => {
      if (isRoomsMobileLayout()) return;
      event.preventDefault();
      const rect = el.roomsLayout.getBoundingClientRect();
      const startX = event.clientX;
      const startWidthPx = (state.roomsSidebar.widthPct / 100) * rect.width;
      state.roomsSidebar.isResizing = true;

      function onMove(moveEvent) {
        if (!state.roomsSidebar.isResizing) return;
        const delta = moveEvent.clientX - startX;
        const widthPx = startWidthPx + delta;
        const widthPct = (widthPx / rect.width) * 100;
        state.roomsSidebar.widthPct = clamp(widthPct, 15, 45);
        state.roomsSidebar.collapsed = false;
        applyRoomsSidebarState();
      }

      function onUp() {
        if (state.roomsSidebar.isResizing) {
          state.roomsSidebar.isResizing = false;
          persistRoomsSidebarState();
        }
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  window.addEventListener('resize', () => {
    applyRoomsSidebarState();
  });
}

async function bootstrap() {
  el.postMessageBtn = el.messageForm ? el.messageForm.querySelector('button[type="submit"]') : null;
  ensureReplyTargetControls();
  loadRoomsSidebarState();
  applyRoomsSidebarState();
  setupRoomsSidebarInteractions();
  updateReplyPinnedIndicator();
  state.identities = loadIdentities();

  const storedActive = String(localStorage.getItem(STORAGE_ACTIVE_KEY) || '').trim();
  const hasStoredActive = storedActive && state.identities.some((item) => item.key === storedActive);
  if (hasStoredActive) {
    state.activeKey = storedActive;
  } else if (state.identities.length) {
    state.activeKey = state.identities[0].key;
  }

  renderIdentitySelect();
  el.activeKeyInput.value = state.activeKey;
  state.paperSearch = String((el.papersSearchInput && el.papersSearchInput.value) || '').trim();
  state.paperDiscussedFilter = String((el.papersFilterSelect && el.papersFilterSelect.value) || 'all').trim() || 'all';
  updateProtectedUi();
  updatePostButtonState();

  try {
    const health = await apiRequest('/api/healthz');
    state.demoMode = Boolean(health.demo_mode);
    state.mockOpenAI = Boolean(health.mock_openai);
  } catch (_) {
    state.demoMode = false;
    state.mockOpenAI = false;
  }
  renderSetupPanel({ reason: !state.activeKey ? 'missing_key' : '' });

  try {
    await refreshDashboard();
  } catch (_) {
    // Dashboard load is best-effort
  }

  try {
    await refreshRoomsAndMessages();
    await refreshAvailableAgents();
  } catch (error) {
    console.warn('Initial load:', error.error || error);
  }

  if (state.activeKey) {
    try {
      await refreshAgentStatus();
      await refreshPapers();
      await refreshAvailableAgents();
      clearError();
    } catch (error) {
      console.warn('Auth data load:', error.error || error);
    }
  }

  startRoomPolling();
}

el.setKeyBtn.addEventListener('click', async () => {
  clearError();
  const value = String(el.activeKeyInput.value || '').trim();
  if (!value) {
    setError('Please enter an API key.', { status: 400, hint: 'Format: litrev_...' });
    return;
  }

  const identity = upsertIdentity({ key: value });
  setActiveKey(value);

  try {
    await refreshAgentStatus();
    await refreshPapers();
    await refreshRoomsAndMessages();
    await refreshAvailableAgents();
    clearError();
  } catch (error) {
    setError(error.error || 'Active key update failed.', error);
  }

  if (!identity) {
    renderIdentitySelect();
  }
});

el.copyKeyBtn.addEventListener('click', async () => {
  if (!state.activeKey) return;
  await copyText(state.activeKey);
});

el.identitySelect.addEventListener('change', async (event) => {
  const selectedKey = String(event.target.value || '').trim();
  setActiveKey(selectedKey);
  clearError();

  if (!selectedKey) {
    el.agentStatus.textContent = 'No active key.';
    return;
  }

  try {
    await refreshAgentStatus();
    await refreshPapers();
    await refreshRoomsAndMessages();
    await refreshAvailableAgents();
  } catch (error) {
    setError(error.error || 'Failed to switch identity.', error);
  }
});

el.removeKeyBtn.addEventListener('click', () => {
  if (!state.activeKey) return;
  state.identities = state.identities.filter((item) => item.key !== state.activeKey);
  persistIdentities();

  const nextKey = state.identities.length ? state.identities[0].key : '';
  setActiveKey(nextKey);
  renderIdentitySelect();
  el.agentStatus.textContent = nextKey ? el.agentStatus.textContent : 'No active key.';
});

// Agent directory filter buttons
const agentDirTop15Btn = document.querySelector('#agent-dir-top15-btn');
const agentDirAllBtn = document.querySelector('#agent-dir-all-btn');
if (agentDirTop15Btn) {
  agentDirTop15Btn.addEventListener('click', async () => {
    state.agentDirShowAll = false;
    await refreshDashboard();
  });
}
if (agentDirAllBtn) {
  agentDirAllBtn.addEventListener('click', async () => {
    state.agentDirShowAll = true;
    await refreshDashboard();
  });
}

el.navButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const view = button.dataset.view;
    if (!view) return;
    switchView(view);
    clearError();

    try {
      if (view === 'dashboard') {
        await refreshDashboard();
      } else if (view === 'rooms') {
        await refreshRoomsAndMessages();
        await refreshAvailableAgents();
      } else if (view === 'papers' && state.activeKey) {
        await refreshPapers();
      } else if (view === 'agent' && state.activeKey) {
        await refreshAgentStatus();
        await refreshAvailableAgents();
      }
    } catch (error) {
      setError(error.error || 'View load failed.', error);
    }
  });
});

el.registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  try {
    const payload = formToObject(el.registerForm);
    const data = await apiRequest('/api/agents/register', {
      method: 'POST',
      body: payload,
    });

    renderRegistration(data);
    const identity = upsertIdentity(data);
    const key = identity ? identity.key : data.api_key;
    setActiveKey(key);
    await copyText(key);

    await refreshAgentStatus();
    await refreshRoomsAndMessages();
    await refreshPapers();
    await refreshAvailableAgents();
    el.registerForm.reset();
  } catch (error) {
    setError(error.error || 'Registration failed.', error);
  }
});

el.copyRegKeyBtn.addEventListener('click', async () => {
  const key = state.registration && state.registration.api_key ? state.registration.api_key : state.activeKey;
  if (!key) return;
  await copyText(key);
});

el.claimNowBtn.addEventListener('click', async () => {
  clearError();

  try {
    const claimUrl = getRegistrationClaimUrl();
    const token = parseClaimToken(claimUrl);
    if (!token) {
      throw {
        status: 400,
        error: 'No claim token found.',
        hint: 'Register first or select an identity with claim_url.',
      };
    }

    const owner = getActiveIdentity() && getActiveIdentity().name ? getActiveIdentity().name : '';
    await apiRequest(`/api/agents/claim/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: owner ? { owner } : {},
    });

    await refreshAgentStatus();
  } catch (error) {
    setError(error.error || 'Claim failed.', error);
  }
});

el.refreshStatusBtn.addEventListener('click', async () => {
  clearError();
  try {
    await refreshAgentStatus();
  } catch (error) {
    setError(error.error || 'Status refresh failed.', error);
  }
});

el.refreshRoomsBtn.addEventListener('click', async () => {
  clearError();
  try {
    await refreshRoomsAndMessages();
  } catch (error) {
    setError(error.error || 'Room refresh failed.', error);
  }
});

el.roomsPollToggle.addEventListener('change', () => {
  startRoomPolling();
});

if (el.attachRunnersBtn) {
  el.attachRunnersBtn.addEventListener('click', async () => {
    clearError();
    if (!state.selectedRoomId) {
      setError('Select a room first.', { status: 400 });
      return;
    }
    try {
      const mode = String((el.attachRunnersMode && el.attachRunnersMode.value) || 'all').trim();
      const room = getRoomById(state.selectedRoomId);
      const payload =
        mode === 'selected' && room && Array.isArray(room.agent_ids) && room.agent_ids.length
          ? { agent_ids: room.agent_ids }
          : {};
      const result = await apiRequest(`/api/rooms/${state.selectedRoomId}/attach_runners`, {
        method: 'POST',
        auth: true,
        body: payload,
      });
      await refreshRunners();
      if (Number(result.attached_count || 0) === 0) {
        setRunnerSuggestionMessage(result.reason || 'No runners online. Start runners and try again.');
        showRunnerSuggestion(true);
      } else {
        showRunnerSuggestion(false);
      }
    } catch (error) {
      setError(error.error || 'Failed to attach runners.', error);
    }
  });
}

if (el.createRoomAgentOptions) {
  el.createRoomAgentOptions.addEventListener('change', () => {
    state.draftRoomAgentIds = selectedRoomAgentIds();
  });
}

if (el.agentsShowAllToggle) {
  el.agentsShowAllToggle.addEventListener('change', () => {
    renderCreateRoomAgentOptions();
  });
}

if (el.agentsShowLegacyToggle) {
  el.agentsShowLegacyToggle.addEventListener('change', () => {
    renderCreateRoomAgentOptions();
  });
}

el.createRoomForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  try {
    const payload = formToObject(el.createRoomForm);
    const selectedAgentIds = [...el.createRoomForm.querySelectorAll('input[name="agent_ids"]:checked')]
      .map((node) => String(node.value || '').trim())
      .filter(Boolean);
    const data = await apiRequest('/api/rooms', {
      method: 'POST',
      auth: true,
      body: { topic: payload.topic, agent_ids: selectedAgentIds },
    });

    state.selectedRoomId = data.room_id;
    el.createRoomForm.reset();
    state.draftRoomAgentIds = [];
    renderCreateRoomAgentOptions();
    await refreshRoomsAndMessages();
  } catch (error) {
    setError(error.error || 'Create room failed.', error);
  }
});

el.roomsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-room-id]');
  if (!button) return;
  state.selectedRoomId = button.dataset.roomId;
  showRunnerSuggestion(false);
  autoCollapseRoomsSidebar();
  clearError();

  try {
    renderRoomsList();
    await refreshRoomsAndMessages();
  } catch (error) {
    setError(error.error || 'Failed to load room.', error);
  }
});

el.messagesThread.addEventListener('click', async (event) => {
  const replyButton = event.target.closest('.reply-msg-btn, .reply-btn');
  if (replyButton) {
    const messageId = String(replyButton.dataset.messageId || replyButton.dataset.msgId || '').trim();
    if (messageId) {
      setReplyTarget(messageId);
      scrollToComposer();
      el.replyToInput.focus();
    }
    return;
  }

  const citationButton = event.target.closest('.copy-citation-btn');
  if (citationButton) {
    const citation = String(citationButton.dataset.citation || '').trim();
    if (citation) {
      await copyText(citation);
    }
  }
});

if (el.applySuggestedPromptBtn) {
  el.applySuggestedPromptBtn.addEventListener('click', () => {
    const kind = String(el.suggestedPromptSelect.value || '').trim();
    if (!kind) return;
    const room = getRoomById(state.selectedRoomId);
    const text = suggestedPromptText(kind, room);
    if (!text) return;
    const roleField = el.messageForm.querySelector('[name="role"]');
    const contentField = el.messageForm.querySelector('[name="content"]');
    if (roleField && kind === 'recommend') roleField.value = 'questions';
    if (contentField) {
      contentField.value = text;
      contentField.focus();
    }
  });
}

el.replyToInput.addEventListener('input', () => {
  state.replyToPinned = true;
  updateReplyPinnedIndicator();
});

el.summaryTemplateBtn.addEventListener('click', () => {
  const contentField = el.messageForm.querySelector('[name="content"]');
  const roleField = el.messageForm.querySelector('[name="role"]');
  if (roleField) roleField.value = 'summary';
  if (contentField) {
    contentField.value = STRUCTURED_SUMMARY_TEMPLATE;
    contentField.focus();
  }
});

el.critiqueTemplateBtn.addEventListener('click', () => {
  const contentField = el.messageForm.querySelector('[name="content"]');
  const roleField = el.messageForm.querySelector('[name="role"]');
  if (roleField) roleField.value = 'critique';
  if (contentField) {
    contentField.value = DISCUSSANT_CRITIQUE_TEMPLATE;
    contentField.focus();
  }
});

el.messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  if (!state.selectedRoomId) {
    setError('Select a room first.', { status: 400 });
    return;
  }

  try {
    const payload = formToObject(el.messageForm);
    const lastMessage = state.messages[state.messages.length - 1];

    if (!state.replyToPinned && !payload.reply_to && lastMessage && lastMessage.id) {
      payload.reply_to = lastMessage.id;
    }

    if (!payload.citation) delete payload.citation;
    if (!payload.question) delete payload.question;
    if (!payload.reply_to) delete payload.reply_to;

    await apiRequest(`/api/rooms/${state.selectedRoomId}/messages`, {
      method: 'POST',
      auth: true,
      body: payload,
    });

    const roleField = el.messageForm.querySelector('[name="role"]');
    const savedRole = roleField ? roleField.value : 'summary';
    const pinnedReplyTarget = state.replyToPinned ? String(el.replyToInput.value || '').trim() : '';
    el.messageForm.reset();
    if (roleField) roleField.value = savedRole;
    if (state.replyToPinned) {
      el.replyToInput.value = pinnedReplyTarget;
    }
    updateReplyPinnedIndicator();

    await refreshRoomsAndMessages();
    scheduleRunnerReplyHint(state.selectedRoomId);
  } catch (error) {
    if (
      Number(error.status) === 409 &&
      typeof error.error === 'string' &&
      /double-post blocked/i.test(error.error)
    ) {
      setError(error.error, {
        status: error.status,
        hint:
          "You're posting as the last author. Switch to another agent key or wait for another agent message.",
      });
      return;
    }
    setError(error.error || 'Post message failed.', error);
  }
});

el.ingestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  try {
    const payload = formToObject(el.ingestForm);
    const result = await apiRequest('/api/papers/ingest', {
      method: 'POST',
      auth: true,
      body: {
        url: payload.url,
        room_id: state.selectedRoomId || undefined,
      },
    });

    state.selectedPaperId = result.paper_id || state.selectedPaperId;
    el.ingestForm.reset();
    await refreshPapers();
  } catch (error) {
    setError(error.error || 'Paper ingest failed.', error);
  }
});

el.refreshPapersBtn.addEventListener('click', async () => {
  clearError();
  try {
    await refreshPapers();
  } catch (error) {
    setError(error.error || 'Paper refresh failed.', error);
  }
});

if (el.papersSearchForm) {
  el.papersSearchForm.addEventListener('input', async () => {
    state.paperSearch = String(el.papersSearchInput.value || '').trim();
    state.paperDiscussedFilter = String(el.papersFilterSelect.value || 'all').trim() || 'all';
    if (!state.activeKey) return;
    try {
      await refreshPapers();
      clearError();
    } catch (error) {
      setError(error.error || 'Paper filter failed.', error);
    }
  });
}

el.papersList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-paper-id]');
  if (!button) return;
  state.selectedPaperId = button.dataset.paperId;
  state.selectedSnippetIds = [];
  clearError();

  try {
    renderPapersList();
    await refreshPapers();
  } catch (error) {
    setError(error.error || 'Paper detail load failed.', error);
  }
});

el.paperDetail.addEventListener('click', async (event) => {
  const roomButton = event.target.closest('.paper-room-link');
  if (roomButton) {
    const roomId = String(roomButton.dataset.roomId || '').trim();
    if (!roomId) return;
    state.selectedRoomId = roomId;
    switchView('rooms');
    try {
      await refreshRoomsAndMessages();
    } catch (error) {
      setError(error.error || 'Failed to open room from paper detail.', error);
    }
    return;
  }

  const button = event.target.closest('.copy-snippet-btn');
  if (button) {
    await copyText(button.dataset.snippet || '');
    return;
  }

  const insertButton = event.target.closest('.insert-selected-citation-btn');
  if (insertButton) {
    if (!state.selectedPaperId) {
      setError('Select a paper first.', { status: 400, hint: 'Choose a paper in the Papers panel.' });
      return;
    }
    const citation = buildSnippetCitation();
    el.messageCitation.value = citation;
    switchView('rooms');
    scrollToComposer();
    el.messageCitation.focus();
  }
});

el.paperDetail.addEventListener('change', (event) => {
  const checkbox = event.target.closest('.snippet-checkbox');
  if (!checkbox) return;
  const index = Number(checkbox.dataset.snippetIndex || 0);
  if (!Number.isInteger(index) || index <= 0) return;

  if (checkbox.checked) {
    state.selectedSnippetIds = [...new Set([...state.selectedSnippetIds, index])].sort((a, b) => a - b);
  } else {
    state.selectedSnippetIds = state.selectedSnippetIds.filter((value) => value !== index);
  }
  const previewNode = el.paperDetail.querySelector('.snippet-citation-preview');
  if (previewNode) {
    previewNode.textContent = buildSnippetCitation() || 'paper:PAPER_ID snippets:1,2';
  }
});

if (el.errorClose) {
  el.errorClose.addEventListener('click', () => {
    clearError();
  });
}

// ─── Paper Feed ───────────────────────────────────────────────────────────────

function feedFmt(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderFeedCards() {
  if (!el.feedCards) return;
  const { items, lastRefreshed } = state.feed;
  if (el.feedLastRefreshed) {
    el.feedLastRefreshed.textContent = lastRefreshed
      ? `Last refreshed: ${feedFmt(lastRefreshed)}`
      : '';
  }
  if (!items.length) {
    el.feedCards.innerHTML = '<div class="feed-empty">No papers yet. Click Refresh Feed.</div>';
    return;
  }
  el.feedCards.innerHTML = items
    .map((item, idx) => {
      const tags = (item.tags || []).slice(0, 4)
        .map((t) => `<span class="feed-card-tag">${escapeHtml(t)}</span>`)
        .join('');
      return `
        <div class="feed-card" data-feed-idx="${idx}" role="button" tabindex="0">
          <div class="feed-card-title">${escapeHtml(item.title)}</div>
          <div class="feed-card-tldr">${escapeHtml(item.tldr_1 || '')}</div>
          <div class="feed-card-meta">
            ${tags}
            <span class="feed-card-date">${escapeHtml(item.venue || 'arXiv')} · ${item.year || feedFmt(item.fetched_at)}</span>
          </div>
        </div>`;
    })
    .join('');

  // Card click → open drawer
  el.feedCards.querySelectorAll('.feed-card').forEach((card) => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.feedIdx, 10);
      openFeedDrawer(state.feed.items[idx]);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') card.click();
    });
  });
}

function openFeedDrawer(item) {
  if (!item || !el.feedDrawerBackdrop) return;
  state.feed.activeItem = item;

  el.feedDrawerTitle.textContent = item.title || 'Paper';
  el.feedDrawerMeta.textContent =
    [item.authors?.slice(0, 3).join(', '), item.year, item.venue]
      .filter(Boolean).join(' · ');

  el.feedDrawerLinks.innerHTML = `
    <a href="${escapeHtml(item.url_abs)}" target="_blank" rel="noopener" class="feed-link-abs">arXiv Page ↗</a>
    <a href="${escapeHtml(item.url_pdf)}" target="_blank" rel="noopener" class="feed-link-pdf">PDF ↗</a>`;

  el.feedDrawerTldr.textContent = item.tldr_1 || '';
  el.feedDrawerWhy.innerHTML = (item.why_recommended || [])
    .map((b) => `<li>${escapeHtml(b)}</li>`).join('');
  el.feedDrawerAbstract.textContent = item.abstract || 'No abstract available.';

  // Populate rooms
  if (el.feedRoomSelect) {
    const rooms = state.rooms || [];
    el.feedRoomSelect.innerHTML =
      '<option value="">Select room…</option>' +
      rooms.map((r) =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml((r.topic || r.id).slice(0, 60))}</option>`
      ).join('');
    if (state.selectedRoomId) el.feedRoomSelect.value = state.selectedRoomId;
  }

  el.feedDrawerBackdrop.classList.remove('hidden');
}

function closeFeedDrawer() {
  if (el.feedDrawerBackdrop) el.feedDrawerBackdrop.classList.add('hidden');
  state.feed.activeItem = null;
}

// Build a structured room message for the given role + paper
// (Implements the full 8-section template from the team spec + role-specific instructions)
function buildFeedRoomMessage(paper, role) {
  const title = paper.title || 'Untitled';
  const abs   = paper.abstract || '(no abstract)';
  const url   = paper.url_abs  || '';
  const pdf   = paper.url_pdf  || '';
  const auth  = (paper.authors || []).slice(0, 4).join(', ') || 'Unknown';
  const yr    = paper.year || '';

  // Shared preamble — always included
  const preamble =
    `**Paper to discuss**\n` +
    `Title: ${title}\n` +
    `Links: ${url} | ${pdf}\n` +
    `Authors/Year: ${auth} (${yr})\n` +
    `Abstract: ${abs}\n\n`;

  const template8 =
    `Follow this format (tight, technical, no fluff):\n` +
    `1) TL;DR (2 sentences)\n` +
    `2) Key contribution (1–3 bullet claims)\n` +
    `3) What's new vs prior work (name closest baseline if obvious)\n` +
    `4) Methods snapshot (core idea + assumptions)\n` +
    `5) Evidence: what experiments/results support the main claims?\n` +
    `6) Limitations / failure modes (min 3, be concrete)\n` +
    `7) Replication notes: data, compute, code availability\n` +
    `8) Next steps: 2 experiments we should run OR 2 ways to extend\n` +
    `If you reference a claim, quote the relevant part of the abstract or section name.`;

  const roleInstructions = {
    scout:
      `You are Scout. Goal: place this paper in context.\n` +
      `Return:\n` +
      `- Closest 3 related papers (title + link)\n` +
      `- One sentence each: how this paper differs\n` +
      `- 3 keywords that define the technique\n` +
      `Be honest if uncertain; do not hallucinate citations.`,
    summarizer:
      `You are Summarizer. Only use the provided abstract and any quoted snippets in-room.\n` +
      template8,
    critic:
      `You are Critic. Your job is to stress-test this paper constructively.\n` +
      `Return:\n` +
      `- 5 strongest objections (each: what could be wrong + why it matters)\n` +
      `- 3 missing ablations that would change your belief\n` +
      `- 2 "gotchas" that often hide in eval (leakage, cherry-picking, tuning budgets, etc.)\n` +
      `No vague critique — tie every point to a specific claim in the TL;DR or contribution.`,
    builder:
      `You are Builder. Convert discussion into a research plan.\n` +
      `Return:\n` +
      `- A minimal reproduction checklist (10 items max)\n` +
      `- A 2-week experiment plan (Day 1–14) with deliverables\n` +
      `- A "drop-in idea": one modification implementable in <200 LOC\n` +
      `Keep it realistic.`,
    synthesizer:
      `You are Synthesizer. Combine Scout + Summarizer + Critic + Builder outputs.\n` +
      `Return:\n` +
      `- 5-bullet executive takeaway\n` +
      `- Decision: {READ / SKIM / IGNORE} with justification\n` +
      `- If READ: which sections to read first and why`,
  };

  const instruction = roleInstructions[role] || roleInstructions.summarizer;
  return preamble + instruction;
}

// Refresh feed from API
async function refreshFeed() {
  const topic = (el.feedTopicInput?.value || '').trim();
  if (!topic) { setError('Please enter a topic first.', {}); return; }
  if (!state.activeKey) { setError('Set your API key first.', {}); return; }
  state.feed.topic = topic;

  if (el.feedRefreshBtn) el.feedRefreshBtn.disabled = true;
  try {
    const res = await apiRequest(`/api/feeds/${encodeURIComponent(topic)}/refresh`, {
      method: 'POST',
      body: JSON.stringify({}),
      auth: true,
    });
    state.feed.items = res.items || [];
    state.feed.lastRefreshed = res.items?.[0]?.fetched_at || new Date().toISOString();
    renderFeedCards();
    clearError();
  } catch (err) {
    setError(err.error || 'Feed refresh failed.', err);
  } finally {
    if (el.feedRefreshBtn) el.feedRefreshBtn.disabled = false;
  }
}

// Load existing cached feed (GET)
async function loadFeedCached(topic) {
  if (!state.activeKey) return;
  try {
    const res = await apiRequest(`/api/feeds/${encodeURIComponent(topic)}`, { auth: true });
    state.feed.items = res.items || [];
    state.feed.lastRefreshed = res.last_refreshed || null;
    renderFeedCards();
  } catch { /* ignore */ }
}

// ── Feed event handlers ──
if (el.feedRefreshBtn) {
  el.feedRefreshBtn.addEventListener('click', refreshFeed);
}

if (el.feedDrawerClose) {
  el.feedDrawerClose.addEventListener('click', closeFeedDrawer);
}

if (el.feedDrawerBackdrop) {
  el.feedDrawerBackdrop.addEventListener('click', (e) => {
    if (e.target === el.feedDrawerBackdrop) closeFeedDrawer();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.feedDrawerBackdrop?.classList.contains('hidden')) {
    closeFeedDrawer();
  }
});

if (el.feedSendBtn) {
  el.feedSendBtn.addEventListener('click', async () => {
    const paper = state.feed.activeItem;
    if (!paper) return;
    const roomId = el.feedRoomSelect?.value;
    if (!roomId) { alert('Please select a room.'); return; }
    const role = el.feedRoleSelect?.value || 'summarizer';

    const content = buildFeedRoomMessage(paper, role);
    const roleToMsgRole = {
      scout: 'related-work',
      summarizer: 'summary',
      critic: 'critique',
      builder: 'experiments',
      synthesizer: 'summary',
    };
    const msgRole = roleToMsgRole[role] || 'summary';

    el.feedSendBtn.disabled = true;
    try {
      await apiRequest(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          role: msgRole,
          citation: paper.id || '',
        }),
        auth: true,
      });
      closeFeedDrawer();
      // Switch to room view so user sees the post
      state.selectedRoomId = roomId;
      switchView('rooms');
      await refreshRoomsAndMessages();
      clearError();
    } catch (err) {
      setError(err.error || 'Failed to send to room.', err);
    } finally {
      el.feedSendBtn.disabled = false;
    }
  });
}

// Load cached feed whenever user navigates to Feed view.
// We patch the existing navButton listeners rather than redeclare switchView.
el.navButtons.forEach((btn) => {
  if (btn.dataset.view === 'feed') {
    btn.addEventListener('click', () => {
      const topic = el.feedTopicInput?.value?.trim() || state.feed.topic;
      loadFeedCached(topic);
    });
  }
});

bootstrap();
