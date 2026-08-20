const STORAGE_KEY = 'mailwatch.v1';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');
const MICROSOFT_SCOPES = ['User.Read', 'Mail.Read'];

const Mail = window.MailwatchMail;

const state = {
  mode: 'connect',
  accounts: [],
  messages: [],
  watchlist: Mail.DEFAULT_WATCHLIST.map((rule) => ({ ...rule, domains: [...rule.domains] })),
  extraSenders: [],
  activeFilter: 'all',
  query: '',
  currentView: 'overview',
  selectedMessage: null,
  toastTimer: null,
  googleClientId: '',
  microsoftClientId: '',
  googleTokenClient: null,
  msal: null,
  syncing: false,
  lastSync: null,
  prefs: {
    browserAlert: true,
    digest: false
  },
  localFlags: {}
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function initialsFrom(name = '') {
  const parts = String(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MW';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStore() {
  const current = loadStore();
  const next = {
    ...current,
    googleClientId: state.googleClientId,
    microsoftClientId: state.microsoftClientId,
    extraSenders: state.extraSenders,
    prefs: state.prefs,
    localFlags: state.localFlags,
    lastEmails: state.accounts.map((account) => ({
      provider: account.provider,
      email: account.email,
      name: account.name,
      givenName: account.givenName,
      picture: account.picture
    }))
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function applyFlags(messages) {
  return messages.map((message) => {
    const flags = state.localFlags[message.id];
    if (!flags) return message;
    return { ...message, ...flags };
  });
}

function effectiveWatchlist() {
  return [
    ...state.watchlist,
    ...state.extraSenders.map((sender) => ({
      id: sender.id,
      name: sender.name,
      shortName: sender.name,
      initials: sender.initials,
      kind: sender.kind || 'other',
      domains: [sender.address.replace(/^@/, '')],
      nameHints: []
    }))
  ];
}

function waitFor(predicate, timeout = 8000) {
  return new Promise((resolve) => {
    if (predicate()) return resolve(true);
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        resolve(false);
      }
    }, 40);
  });
}

function showToast(message) {
  const toast = $('#toast');
  $('#toastMessage').textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function setConnectVisible(visible) {
  $('#connectScreen').classList.toggle('hidden', !visible);
  $('#appShell').classList.toggle('hidden', visible);
}

function currentOrigin() {
  return window.location.origin;
}

function weekdayHeadline() {
  return new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).toUpperCase();
}

function greetingName() {
  const live = state.accounts[0];
  if (live?.givenName) return live.givenName;
  if (live?.name) return live.name.split(' ')[0];
  if (state.mode === 'demo') return 'there';
  return 'there';
}

function primaryAccount() {
  return state.accounts[0] || null;
}

function updateAccountChrome() {
  const account = primaryAccount();
  const email = account?.email || (state.mode === 'demo' ? 'Demo inbox' : 'Not connected');
  const name = account?.name || (state.mode === 'demo' ? 'Demo' : 'Mailwatch');
  const initials = initialsFrom(name === 'Demo' ? 'Demo Watch' : name);
  $$('[data-account-email]').forEach((node) => { node.textContent = email; });
  $$('[data-account-initials]').forEach((node) => { node.textContent = initials; });
  $('#accountEyebrow').textContent = state.mode === 'live' ? 'Watching inbox' : state.mode === 'demo' ? 'Demo mode' : 'Mailbox';
  $('#onlineDot').classList.toggle('offline', state.mode !== 'live');
  const health = $('#healthValue');
  const healthFoot = $('#healthFoot');
  if (state.mode === 'live') {
    health.textContent = 'Healthy';
    healthFoot.innerHTML = `<span class="trend green-text">Connected</span> · ${state.accounts.map((item) => item.provider === 'google' ? 'Gmail' : 'Outlook').join(' + ')}`;
  } else if (state.mode === 'demo') {
    health.textContent = 'Demo';
    healthFoot.innerHTML = '<span class="trend blue-text">Sample mail</span> · connect to go live';
  } else {
    health.textContent = 'Idle';
    healthFoot.innerHTML = '<span class="trend warm-text">Not connected</span>';
  }
  const connectedBadge = $('#connectedBadge');
  if (connectedBadge) {
    connectedBadge.classList.toggle('disconnected-badge', state.mode !== 'live');
    connectedBadge.innerHTML = state.mode === 'live'
      ? '<span></span> Connected'
      : state.mode === 'demo' ? '<span></span> Demo' : '<span></span> Off';
  }
  const settingsMeta = $('#settingsAccountMeta');
  if (settingsMeta) {
    const providers = state.accounts.map((item) => item.provider === 'google' ? 'Gmail' : 'Outlook').join(' · ') || 'No mailbox';
    settingsMeta.textContent = state.mode === 'demo' ? 'Sample UNB and IRCC messages' : providers;
  }
  const hour = new Date().getHours();
  $('#greetingLead').textContent = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  $('#greetingName').textContent = greetingName();
  $('#todayOverline').textContent = weekdayHeadline();
  const origin = currentOrigin();
  ['#originCopy', '#originCopyMs', '#heroOriginCopy'].forEach((selector) => {
    const input = $(selector);
    if (input) input.value = origin;
  });
  $('#googleClientInput').value = state.googleClientId;
  $('#microsoftClientInput').value = state.microsoftClientId;
  $('#googleClientSettings').value = state.googleClientId;
  $('#microsoftClientSettings').value = state.microsoftClientId;
  renderConnectedAccounts();
}

function renderConnectedAccounts() {
  const host = $('#connectedAccounts');
  if (!host) return;
  if (!state.accounts.length && state.mode === 'demo') {
    host.innerHTML = `
      <div class="connected-account">
        <span class="large-account-avatar">DW</span>
        <div>
          <strong>Demo inbox</strong>
          <span>Sample UNB Fredericton and IRCC mail</span>
        </div>
        <button class="button button-quiet" id="leaveDemoButton" type="button">Connect a mailbox</button>
      </div>`;
    $('#leaveDemoButton')?.addEventListener('click', () => {
      state.mode = 'connect';
      setConnectVisible(true);
    });
    return;
  }
  if (!state.accounts.length) {
    host.innerHTML = `
      <div class="connected-account">
        <span class="large-account-avatar">+</span>
        <div>
          <strong>No mailbox connected</strong>
          <span>Link Gmail or Outlook to start watching UNB and IRCC.</span>
        </div>
        <button class="button button-quiet" id="connectFromSettings" type="button">Connect</button>
      </div>`;
    $('#connectFromSettings')?.addEventListener('click', () => openModal('connectModal'));
    return;
  }
  host.innerHTML = state.accounts.map((account) => `
    <div class="connected-account">
      <span class="large-account-avatar">${escapeHtml(initialsFrom(account.name || account.email))}</span>
      <div>
        <strong>${escapeHtml(account.email)}</strong>
        <span>${account.provider === 'google' ? 'Gmail' : 'Outlook'} · read-only</span>
      </div>
      <button class="button button-quiet" type="button" data-disconnect="${escapeHtml(account.provider)}">Disconnect</button>
    </div>
  `).join('');
  $$('[data-disconnect]', host).forEach((button) => {
    button.addEventListener('click', () => disconnectProvider(button.dataset.disconnect));
  });
}

function getVisibleMessages() {
  const normalizedQuery = state.query.trim().toLowerCase();
  return state.messages.filter((message) => {
    const matchesFilter = state.activeFilter === 'all'
      || (state.activeFilter === 'priority' && message.priority)
      || message.category === state.activeFilter;
    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;
    return [message.sender, message.senderFull, message.address, message.subject, message.snippet]
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
}

function renderMessages() {
  const visibleMessages = getVisibleMessages();
  const list = $('#messageList');
  const emptyState = $('#emptyState');
  $('#messageCount').textContent = visibleMessages.length;
  list.innerHTML = visibleMessages.map((message) => `
    <article class="message-row ${message.unread ? 'unread' : ''}" data-message="${escapeHtml(message.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(message.subject)}">
      <span class="message-avatar ${message.category === 'school' ? 'school-mark' : message.category === 'ircc' ? 'ircc-mark' : 'other-mark'}">${escapeHtml(message.initials)}</span>
      <span class="sender-cell"><strong>${escapeHtml(message.sender)}</strong>${message.unread ? '<span class="unread-dot" aria-label="Unread"></span>' : ''}</span>
      <span class="subject-cell"><strong>${escapeHtml(message.subject)}</strong><span>${escapeHtml(message.snippet)}</span></span>
      <span class="message-tags"><span class="tag ${escapeHtml(message.tagClass)}">${escapeHtml(message.tag)}</span></span>
      <span class="message-date">${escapeHtml(message.date)}</span>
      <button class="star-button ${message.starred ? 'starred' : ''}" data-star-message="${escapeHtml(message.id)}" aria-label="${message.starred ? 'Unstar' : 'Star'} message">
        <svg viewBox="0 0 24 24" fill="${message.starred ? 'currentColor' : 'none'}"><path d="m12 4.25 2.36 4.78 5.28.77-3.82 3.72.9 5.26L12 16.3l-4.72 2.48.9-5.26-3.82-3.72 5.28-.77L12 4.25Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
      </button>
    </article>
  `).join('');
  list.classList.toggle('hidden', visibleMessages.length === 0);
  emptyState.classList.toggle('hidden', visibleMessages.length !== 0);
  const emptyCopy = state.mode === 'live'
    ? 'Mailwatch is watching UNB and IRCC. Nothing matching right now.'
    : 'Try another search or filter.';
  $('#emptyStateCopy').textContent = emptyCopy;
  updateStats();
  renderAttention();
}

function updateStats() {
  const unread = state.messages.filter((message) => message.unread).length;
  const attention = state.messages.filter((message) => message.priority && message.unread).length;
  const weekAgo = Date.now() - 7 * 86400000;
  const weekCount = state.messages.filter((message) => message.receivedAt >= weekAgo).length;
  $('#unreadStat').textContent = unread;
  $('#attentionStat').textContent = attention;
  $('#weekStat').textContent = weekCount;
  $('#senderWatchCount').textContent = `${effectiveWatchlist().length} senders`;
  $('.attention-total').textContent = attention;
  $('.nav-count').textContent = attention;
  const badge = $('#notificationBadge');
  badge.textContent = attention;
  badge.classList.toggle('hidden', attention === 0);
  const unreadTrend = unread === 0 ? 'All caught up' : `${unread} waiting`;
  $('#unreadFoot').innerHTML = `<span class="trend ${unread ? 'up' : 'green-text'}">${unread ? '↑' : '✓'}</span> ${unreadTrend}`;
}

function renderAttention() {
  const items = state.messages.filter((message) => message.priority && message.unread).slice(0, 4);
  const host = $('#attentionList');
  if (!items.length) {
    host.innerHTML = `<div class="attention-empty">Nothing urgent from UNB or IRCC.</div>`;
    return;
  }
  host.innerHTML = items.map((message) => `
    <button class="attention-item" data-message="${escapeHtml(message.id)}" type="button">
      <span class="attention-icon ${message.category === 'school' ? 'school-mark' : 'ircc-mark'}">${escapeHtml(message.initials)}</span>
      <span class="attention-copy"><strong>${escapeHtml(message.sender)}</strong><span>${escapeHtml(message.subject)}</span></span>
      <span class="attention-arrow"><svg viewBox="0 0 24 24" fill="none"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </button>
  `).join('');
  $$('.attention-item', host).forEach((item) => {
    item.addEventListener('click', () => showMessage(item.dataset.message));
  });
}

function renderRules() {
  const rules = effectiveWatchlist();
  $('#ruleList').innerHTML = rules.map((rule) => `
    <div class="rule-row">
      <span class="rule-avatar ${rule.kind === 'school' ? 'school-avatar' : rule.kind === 'ircc' ? 'ircc-avatar' : ''}">${escapeHtml(rule.initials)}</span>
      <div class="rule-copy"><strong>${escapeHtml(rule.name)}</strong><span>${escapeHtml((rule.domains || [rule.address]).join(', '))}</span></div>
      <span class="rule-status"></span>
    </div>
  `).join('');
  $('#watchingCount').textContent = `Watching ${rules.length} sender group${rules.length === 1 ? '' : 's'}`;
}

function updateFilterTabs() {
  $$('.filter-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.filter === state.activeFilter));
}

function updateSyncStatus() {
  if (state.syncing) {
    $('#syncStatus').textContent = 'Checking mailbox…';
    return;
  }
  if (!state.lastSync) {
    $('#syncStatus').textContent = state.mode === 'demo' ? 'Demo data' : 'Not synced yet';
    return;
  }
  const delta = Date.now() - state.lastSync;
  if (delta < 15000) $('#syncStatus').textContent = 'Synced just now';
  else if (delta < 60000) $('#syncStatus').textContent = 'Synced moments ago';
  else $('#syncStatus').textContent = `Synced ${Math.max(1, Math.round(delta / 60000))} min ago`;
}

function openModal(id) {
  const backdrop = $('#modalBackdrop');
  $$('.modal', backdrop).forEach((modal) => modal.classList.toggle('active', modal.id === id));
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const firstInput = $(`#${id} input`);
  if (firstInput) setTimeout(() => firstInput.focus(), 40);
}

function closeModal() {
  const backdrop = $('#modalBackdrop');
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  $$('.modal', backdrop).forEach((modal) => modal.classList.remove('active'));
  document.body.style.overflow = '';
  state.selectedMessage = null;
}

function renderEmailFrame(html) {
  const frame = $('#emailFrame');
  const documentHtml = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; padding: 16px 18px; background: #fff; color: #2c3a3f; font: 15px/1.6 "DM Sans", ui-sans-serif, system-ui, sans-serif; word-wrap: break-word; overflow-wrap: anywhere; }
  img, video { max-width: 100%; height: auto; border-radius: 6px; }
  table { max-width: 100%; border-collapse: collapse; }
  a { color: #2a7566; }
  p { margin: 0 0 12px; }
</style></head><body>${html || '<p>This message has no readable content.</p>'}</body></html>`;
  frame.removeAttribute('height');
  frame.style.height = '240px';
  frame.srcdoc = documentHtml;
  const fit = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, 160);
      frame.style.height = `${height + 8}px`;
    } catch {
      frame.style.height = '60vh';
    }
  };
  frame.onload = fit;
  setTimeout(fit, 80);
  setTimeout(fit, 400);
}

async function showMessage(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;
  state.selectedMessage = messageId;
  const avatar = $('#detailAvatar');
  avatar.textContent = message.initials;
  avatar.className = `detail-avatar ${message.category === 'school' ? 'school-mark' : message.category === 'ircc' ? 'ircc-mark' : 'other-mark'}`;
  $('#detailCategory').textContent = message.category === 'school' ? 'UNB FREDERICTON' : message.category === 'ircc' ? 'IRCC' : 'WATCHLIST';
  $('#detailDate').textContent = message.dateFull;
  $('#messageModalTitle').textContent = message.subject;
  $('#detailSender').textContent = `${message.senderFull} <${message.address}>`;
  $('#detailStar').classList.toggle('starred', message.starred);
  $('#detailStar svg').setAttribute('fill', message.starred ? 'currentColor' : 'none');
  $('#detailReadButton').textContent = message.unread ? 'Mark as read' : 'Mark as unread';
  const openLabel = message.provider === 'microsoft' ? 'Open in Outlook' : message.provider === 'google' ? 'Open in Gmail' : 'Open original';
  $('#openOriginalButton').querySelector('span').textContent = openLabel;
  openModal('messageModal');
  $('#detailScroll').scrollTop = 0;
  if (message.renderedHtml) {
    renderEmailFrame(message.renderedHtml);
    return;
  }
  renderEmailFrame('<p>Opening message…</p>');
  try {
    const account = state.accounts.find((item) => item.provider === message.provider);
    let token = account?.accessToken;
    if (account?.provider === 'google') token = await ensureGoogleToken(account, { interactive: false });
    if (account?.provider === 'microsoft') token = await ensureMicrosoftToken(account, { interactive: false });
    const html = await Mail.loadReadableBody(message, token);
    if (state.selectedMessage !== messageId) return;
    message.renderedHtml = html;
    renderEmailFrame(html);
  } catch (error) {
    console.error(error);
    if (state.selectedMessage !== messageId) return;
    renderEmailFrame(Mail.textToHtml(message.body || 'Could not open this message. Use Open original to view it in your mailbox.'));
  }
}

function setMessageFlag(messageId, patch) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) return;
  Object.assign(message, patch);
  state.localFlags[messageId] = { ...(state.localFlags[messageId] || {}), ...patch };
  saveStore();
  renderMessages();
  if (state.selectedMessage === messageId) showMessage(messageId);
}

function setView(view) {
  state.currentView = view;
  let section = view;
  if (view === 'priority' || view === 'senders') section = 'overview';
  $$('.view-section').forEach((item) => item.classList.toggle('active', item.id === `${section}View`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const labels = { overview: 'Overview', priority: 'Priority inbox', senders: 'Monitored senders', settings: 'Settings', help: 'How it works' };
  $('#breadcrumbCurrent').textContent = labels[view] || 'Overview';
  if (view === 'priority') {
    state.activeFilter = 'priority';
    $('#inboxTitle').textContent = 'Priority inbox';
    $('.inbox-heading p').textContent = 'The UNB and IRCC messages most likely to need a next step.';
  } else if (view === 'overview' || view === 'senders') {
    state.activeFilter = 'all';
    $('#inboxTitle').textContent = 'Your watchlist';
    $('.inbox-heading p').textContent = 'Messages from UNB Fredericton and IRCC.';
  }
  updateFilterTabs();
  renderMessages();
  if (view === 'senders') {
    setTimeout(() => $('#rulesPanel').scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
  }
  closeSidebar();
}

function openSenderModal() {
  $('#senderForm').reset();
  openModal('senderModal');
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebarOverlay').classList.remove('open');
}

function notifyNewMail(previousIds, nextMessages) {
  if (!state.prefs.browserAlert || state.mode !== 'live') return;
  if (!previousIds) return;
  const fresh = nextMessages.filter((message) => !previousIds.has(message.id) && message.unread);
  if (!fresh.length) return;
  const first = fresh[0];
  if (Notification.permission === 'granted') {
    try {
      new Notification(`${first.sender}: ${first.subject}`, { body: first.snippet, silent: false });
    } catch {
      /* ignore */
    }
  }
  showToast(fresh.length === 1 ? `New mail from ${first.sender}` : `${fresh.length} new watched messages`);
}

async function requestNotifications() {
  if (!state.prefs.browserAlert) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
  }
}

async function syncMailbox({ silent = false } = {}) {
  if (state.syncing) return;
  const button = $('#syncButton');
  state.syncing = true;
  button?.classList.add('syncing');
  if (button) button.disabled = true;
  $('#syncButtonText').textContent = 'Checking…';
  updateSyncStatus();
  const previousIds = silent ? new Set(state.messages.map((message) => message.id)) : null;
  try {
    if (state.mode === 'demo') {
      await new Promise((resolve) => setTimeout(resolve, 700));
      state.messages = applyFlags(Mail.demoMessages(effectiveWatchlist()));
    } else if (state.mode === 'live') {
      const bundles = await Promise.all(state.accounts.map(async (account) => {
        try {
          if (account.provider === 'google') {
            account.accessToken = await ensureGoogleToken(account, { interactive: false });
            return Mail.fetchGmailMessages(account.accessToken, effectiveWatchlist(), account.provider);
          }
          account.accessToken = await ensureMicrosoftToken(account, { interactive: false });
          return Mail.fetchOutlookMessages(account.accessToken, effectiveWatchlist(), account.provider);
        } catch (error) {
          if (error.status === 401 && !silent) {
            showToast(`Reconnect ${account.provider === 'google' ? 'Gmail' : 'Outlook'}`);
          }
          return [];
        }
      }));
      const merged = bundles.flat().sort((a, b) => b.receivedAt - a.receivedAt);
      notifyNewMail(previousIds, merged);
      state.messages = applyFlags(merged);
    }
    state.lastSync = Date.now();
    renderMessages();
    if (!silent) showToast(state.mode === 'demo' ? 'Demo watchlist is up to date' : 'Mailbox is up to date');
  } catch (error) {
    console.error(error);
    if (!silent) showToast('Could not sync mailbox');
  } finally {
    state.syncing = false;
    button?.classList.remove('syncing');
    if (button) button.disabled = false;
    $('#syncButtonText').textContent = 'Sync now';
    updateSyncStatus();
  }
}

function enterApp(mode) {
  state.mode = mode;
  setConnectVisible(false);
  updateAccountChrome();
  renderRules();
  setView('overview');
  syncMailbox({ silent: true });
}

function enterDemo() {
  state.accounts = [];
  state.messages = applyFlags(Mail.demoMessages(effectiveWatchlist()));
  state.lastSync = Date.now();
  enterApp('demo');
  showToast('Exploring with sample UNB and IRCC mail');
}

async function initGoogleClient() {
  if (!state.googleClientId) return null;
  const ready = await waitFor(() => Boolean(window.google?.accounts?.oauth2), 8000);
  if (!ready) return null;
  state.googleTokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: state.googleClientId,
    scope: GOOGLE_SCOPES,
    callback: () => {}
  });
  return state.googleTokenClient;
}

function requestGoogleToken({ prompt = 'consent', hint = '' } = {}) {
  return new Promise((resolve, reject) => {
    if (!state.googleTokenClient) {
      reject(new Error('Google client is not ready'));
      return;
    }
    state.googleTokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      resolve(response.access_token);
    };
    const options = { prompt };
    if (hint) options.hint = hint;
    state.googleTokenClient.requestAccessToken(options);
  });
}

async function ensureGoogleToken(account, { interactive = true } = {}) {
  if (account.accessToken && account.expiresAt && account.expiresAt - 30000 > Date.now()) {
    return account.accessToken;
  }
  await initGoogleClient();
  try {
    const token = await requestGoogleToken({ prompt: '', hint: account.email });
    account.accessToken = token;
    account.expiresAt = Date.now() + 55 * 60 * 1000;
    return token;
  } catch (error) {
    if (!interactive) throw error;
    const token = await requestGoogleToken({ prompt: 'consent', hint: account.email });
    account.accessToken = token;
    account.expiresAt = Date.now() + 55 * 60 * 1000;
    return token;
  }
}

async function initMsal() {
  if (!state.microsoftClientId) return null;
  const ready = await waitFor(() => Boolean(window.msal?.PublicClientApplication), 8000);
  if (!ready) return null;
  if (state.msal) return state.msal;
  state.msal = new window.msal.PublicClientApplication({
    auth: {
      clientId: state.microsoftClientId,
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: currentOrigin(),
      postLogoutRedirectUri: currentOrigin()
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
  });
  if (typeof state.msal.initialize === 'function') {
    await state.msal.initialize();
  }
  return state.msal;
}

async function ensureMicrosoftToken(account, { interactive = true } = {}) {
  const pca = await initMsal();
  if (!pca) throw new Error('Microsoft client is not ready');
  const accounts = pca.getAllAccounts();
  const msalAccount = accounts.find((item) => (item.username || '').toLowerCase() === account.email.toLowerCase()) || accounts[0];
  try {
    const result = await pca.acquireTokenSilent({ scopes: MICROSOFT_SCOPES, account: msalAccount });
    account.accessToken = result.accessToken;
    account.expiresAt = Date.now() + 50 * 60 * 1000;
    return result.accessToken;
  } catch (error) {
    if (!interactive) throw error;
    const result = await pca.acquireTokenPopup({ scopes: MICROSOFT_SCOPES, account: msalAccount });
    account.accessToken = result.accessToken;
    account.expiresAt = Date.now() + 50 * 60 * 1000;
    return result.accessToken;
  }
}

function upsertAccount(next) {
  const index = state.accounts.findIndex((account) => account.provider === next.provider && account.email === next.email);
  if (index >= 0) state.accounts[index] = { ...state.accounts[index], ...next };
  else state.accounts.push(next);
  saveStore();
}

async function connectGoogle({ switchAccount = false } = {}) {
  if (!state.googleClientId.trim()) {
    openSetup('google');
    return;
  }
  try {
    await initGoogleClient();
    if (!state.googleTokenClient) {
      showToast('Google sign-in script did not load. Check your network.');
      return;
    }
    const token = await requestGoogleToken({ prompt: switchAccount ? 'select_account' : 'consent' });
    const profile = await Mail.fetchGmailProfile(token);
    upsertAccount({
      provider: 'google',
      accessToken: token,
      expiresAt: Date.now() + 55 * 60 * 1000,
      email: profile.email,
      name: profile.name,
      givenName: profile.givenName,
      picture: profile.picture
    });
    closeModal();
    enterApp('live');
    showToast(`Connected ${profile.email}`);
    requestNotifications();
  } catch (error) {
    console.error(error);
    const text = String(error.message || error.error || '');
    if (googleErrorLooksLikeTester(error)) {
      showToast('That Google account is not a test user. Use another account, or add it in Google Cloud.');
    } else if (googleErrorLooksLikeOrigin(error)) {
      openSetup('google', { originError: true });
      showToast('Add this site origin in Google Cloud, then try again');
    } else if (/popup/i.test(text)) {
      showToast('Sign-in closed. Try Outlook, or pick another Google account.');
    } else {
      showToast('Google sign-in did not finish');
    }
  }
}

async function signOutAll() {
  const googleAccount = state.accounts.find((account) => account.provider === 'google');
  if (googleAccount?.accessToken && window.google?.accounts?.oauth2?.revoke) {
    try {
      await new Promise((resolve) => {
        window.google.accounts.oauth2.revoke(googleAccount.accessToken, () => resolve());
        setTimeout(resolve, 1200);
      });
    } catch {
      /* ignore */
    }
  }
  try {
    const pca = state.msal || (state.microsoftClientId ? await initMsal() : null);
    const msalAccount = pca?.getAllAccounts?.()?.[0];
    if (pca && msalAccount) {
      await pca.logoutPopup({ account: msalAccount });
    }
  } catch {
    /* user may cancel the Microsoft logout popup */
  }
  state.accounts = [];
  state.messages = [];
  state.mode = 'connect';
  state.lastSync = null;
  saveStore();
  closeModal();
  closeSidebar();
  setConnectVisible(true);
  updateAccountChrome();
  showToast('Signed out. You can use another Google account or Outlook.');
}

async function connectMicrosoft() {
  if (!state.microsoftClientId.trim()) {
    openSetup('microsoft');
    return;
  }
  try {
    const pca = await initMsal();
    if (!pca) {
      showToast('Microsoft sign-in script did not load. Check your network.');
      return;
    }
    const result = await pca.loginPopup({ scopes: MICROSOFT_SCOPES });
    const token = result.accessToken;
    const profile = await Mail.fetchOutlookProfile(token);
    upsertAccount({
      provider: 'microsoft',
      accessToken: token,
      expiresAt: Date.now() + 50 * 60 * 1000,
      email: profile.email,
      name: profile.name,
      givenName: profile.givenName,
      picture: ''
    });
    closeModal();
    enterApp('live');
    showToast(`Connected ${profile.email}`);
    requestNotifications();
  } catch (error) {
    console.error(error);
    showToast('Microsoft sign-in did not finish');
  }
}

function disconnectProvider(provider) {
  state.accounts = state.accounts.filter((account) => account.provider !== provider);
  saveStore();
  if (!state.accounts.length) {
    state.mode = 'connect';
    state.messages = [];
    setConnectVisible(true);
    updateAccountChrome();
    showToast('Mailbox disconnected');
    return;
  }
  updateAccountChrome();
  syncMailbox({ silent: true });
  showToast('Account disconnected');
}

function googleErrorLooksLikeOrigin(error) {
  const text = `${error?.message || ''} ${error?.error || ''} ${error?.details || ''}`.toLowerCase();
  return /origin|invalid_client|unauthorized_client/.test(text);
}

function googleErrorLooksLikeTester(error) {
  const text = `${error?.message || ''} ${error?.error || ''} ${error?.details || ''}`.toLowerCase();
  return /access_denied|verification|tested|test user/.test(text);
}

function openSetup(provider = 'google', { originError = false } = {}) {
  $$('.setup-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.provider === provider));
  $$('.setup-switch').forEach((button) => button.classList.toggle('active', button.dataset.provider === provider));
  const banner = $('#originError');
  if (banner) banner.classList.toggle('hidden', !(originError && provider === 'google'));
  updateAccountChrome();
  openModal('setupModal');
}

function copyOrigin(id) {
  const input = $(id);
  input.select();
  navigator.clipboard?.writeText(input.value).then(() => showToast('Origin copied')).catch(() => {
    document.execCommand('copy');
    showToast('Origin copied');
  });
}

function persistClientIdsFromSettings() {
  state.googleClientId = $('#googleClientSettings').value.trim();
  state.microsoftClientId = $('#microsoftClientSettings').value.trim();
  saveStore();
  state.googleTokenClient = null;
  state.msal = null;
}

async function restoreSession() {
  const stored = loadStore();
  state.googleClientId = stored.googleClientId || '';
  state.microsoftClientId = stored.microsoftClientId || '';
  state.extraSenders = stored.extraSenders || [];
  state.prefs = { ...state.prefs, ...(stored.prefs || {}) };
  state.localFlags = stored.localFlags || {};
  $('#browserAlertToggle').checked = state.prefs.browserAlert;
  $('#digestToggle').checked = state.prefs.digest;
  try {
    const remote = await fetch('/api/public-config').then((response) => response.json());
    if (!state.googleClientId && remote.googleClientId) state.googleClientId = remote.googleClientId;
    if (!state.microsoftClientId && remote.microsoftClientId) state.microsoftClientId = remote.microsoftClientId;
  } catch {
    /* static file server is fine */
  }
  updateAccountChrome();
  renderRules();

  if (state.googleClientId) {
    await initGoogleClient();
    const hint = (stored.lastEmails || []).find((item) => item.provider === 'google');
    if (hint && state.googleTokenClient) {
      try {
        const token = await requestGoogleToken({ prompt: '', hint: hint.email });
        const profile = await Mail.fetchGmailProfile(token);
        upsertAccount({
          provider: 'google',
          accessToken: token,
          expiresAt: Date.now() + 55 * 60 * 1000,
          email: profile.email,
          name: profile.name,
          givenName: profile.givenName,
          picture: profile.picture
        });
      } catch {
        /* user will reconnect */
      }
    }
  }
  if (state.microsoftClientId) {
    try {
      const pca = await initMsal();
      const accounts = pca?.getAllAccounts?.() || [];
      if (accounts.length) {
        const result = await pca.acquireTokenSilent({ scopes: MICROSOFT_SCOPES, account: accounts[0] });
        const profile = await Mail.fetchOutlookProfile(result.accessToken);
        upsertAccount({
          provider: 'microsoft',
          accessToken: result.accessToken,
          expiresAt: Date.now() + 50 * 60 * 1000,
          email: profile.email,
          name: profile.name,
          givenName: profile.givenName,
          picture: ''
        });
      }
    } catch {
      /* user will reconnect */
    }
  }

  if (state.accounts.length) {
    enterApp('live');
  } else {
    setConnectVisible(true);
    updateAccountChrome();
  }
}

function bindEvents() {
  $$('.nav-item').forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
  $$('.filter-tab').forEach((tab) => tab.addEventListener('click', () => {
    state.activeFilter = tab.dataset.filter;
    state.currentView = 'overview';
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === 'overview'));
    $('#breadcrumbCurrent').textContent = 'Overview';
    $('#inboxTitle').textContent = 'Your watchlist';
    $('.inbox-heading p').textContent = 'Messages from UNB Fredericton and IRCC.';
    updateFilterTabs();
    renderMessages();
  }));
  $('#searchInput').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderMessages();
  });
  $('#messageList').addEventListener('click', (event) => {
    const starButton = event.target.closest('[data-star-message]');
    if (starButton) {
      event.stopPropagation();
      const message = state.messages.find((item) => item.id === starButton.dataset.starMessage);
      if (message) {
        setMessageFlag(message.id, { starred: !message.starred });
        showToast(message.starred ? 'Message starred' : 'Removed star');
      }
      return;
    }
    const row = event.target.closest('[data-message]');
    if (row) showMessage(row.dataset.message);
  });
  $('#messageList').addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-message]')) {
      event.preventDefault();
      showMessage(event.target.closest('[data-message]').dataset.message);
    }
  });
  $('#markAllRead').addEventListener('click', () => {
    const unread = state.messages.filter((message) => message.unread);
    if (!unread.length) {
      showToast('Everything is already read');
      return;
    }
    unread.forEach((message) => setMessageFlag(message.id, { unread: false }));
    showToast(`${unread.length} messages marked as read`);
  });
  $('#syncButton').addEventListener('click', () => syncMailbox());
  $('#notificationButton').addEventListener('click', () => {
    setView('priority');
    showToast('Showing priority messages');
  });
  $('#viewAllButton').addEventListener('click', () => setView('senders'));
  $('#openSidebar').addEventListener('click', () => {
    $('#sidebar').classList.add('open');
    $('#sidebarOverlay').classList.add('open');
  });
  $('#closeSidebar').addEventListener('click', closeSidebar);
  $('#sidebarOverlay').addEventListener('click', closeSidebar);
  $('#monitorButton').addEventListener('click', openSenderModal);
  $('#addRuleButton').addEventListener('click', openSenderModal);
  $('#editRulesButton').addEventListener('click', openSenderModal);
  $('#changeMailboxButton').addEventListener('click', () => openModal('connectModal'));
  $('#connectGmail').addEventListener('click', () => connectGoogle());
  $('#connectMicrosoft').addEventListener('click', connectMicrosoft);
  $('#heroGoogle').addEventListener('click', () => connectGoogle());
  $('#heroMicrosoft').addEventListener('click', connectMicrosoft);
  $('#heroSwitchGoogle')?.addEventListener('click', () => connectGoogle({ switchAccount: true }));
  $('#connectSwitchGoogle')?.addEventListener('click', () => connectGoogle({ switchAccount: true }));
  $('#switchGoogleButton')?.addEventListener('click', () => connectGoogle({ switchAccount: true }));
  $('#heroSignOut')?.addEventListener('click', signOutAll);
  $('#signOutButton')?.addEventListener('click', signOutAll);
  $('#signOutSettings')?.addEventListener('click', signOutAll);
  $('#heroDemo').addEventListener('click', enterDemo);
  $('#openSetupFromHero').addEventListener('click', () => openSetup('google'));
  $('#openSetupFromConnect').addEventListener('click', () => openSetup('google'));
  $$('.setup-switch').forEach((button) => button.addEventListener('click', () => openSetup(button.dataset.provider)));
  $('#copyOrigin').addEventListener('click', () => copyOrigin('#originCopy'));
  $('#copyOriginMs').addEventListener('click', () => copyOrigin('#originCopyMs'));
  $('#saveGoogleClient').addEventListener('click', async () => {
    state.googleClientId = $('#googleClientInput').value.trim();
    saveStore();
    state.googleTokenClient = null;
    closeModal();
    showToast('Google client ID saved');
    await connectGoogle();
  });
  $('#saveMicrosoftClient').addEventListener('click', async () => {
    state.microsoftClientId = $('#microsoftClientInput').value.trim();
    saveStore();
    state.msal = null;
    closeModal();
    showToast('Microsoft client ID saved');
    await connectMicrosoft();
  });
  $('#settingsSaveButton').addEventListener('click', () => {
    persistClientIdsFromSettings();
    state.prefs.browserAlert = $('#browserAlertToggle').checked;
    state.prefs.digest = $('#digestToggle').checked;
    saveStore();
    showToast('Preferences saved');
    requestNotifications();
  });
  $('#keywordButton').addEventListener('click', () => {
    showToast('Priority already flags biometrics, deadlines, and action mail');
  });
  $('#openOriginalButton').addEventListener('click', () => {
    const message = state.messages.find((item) => item.id === state.selectedMessage);
    if (message?.webLink) window.open(message.webLink, '_blank', 'noopener');
    else showToast('Original link is available after a live mailbox is connected');
  });
  $('#detailStar').addEventListener('click', () => {
    const message = state.messages.find((item) => item.id === state.selectedMessage);
    if (message) {
      setMessageFlag(message.id, { starred: !message.starred });
      showToast(message.starred ? 'Message starred' : 'Removed star');
    }
  });
  $('#detailReadButton').addEventListener('click', () => {
    const message = state.messages.find((item) => item.id === state.selectedMessage);
    if (message) {
      setMessageFlag(message.id, { unread: !message.unread });
      showToast(message.unread ? 'Marked as unread' : 'Marked as read');
    }
  });
  $('#senderForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const address = String(formData.get('address') || '').trim().replace(/^@/, '');
    const name = String(formData.get('name') || '').trim() || address.split('@')[0] || 'New sender';
    if (!address) return;
    const exists = effectiveWatchlist().some((rule) => (rule.domains || []).some((domain) => domain.toLowerCase() === address.toLowerCase()) || rule.address?.toLowerCase() === address.toLowerCase());
    if (exists) {
      closeModal();
      showToast('That sender is already on your watchlist');
      return;
    }
    state.extraSenders.push({
      id: `custom-${Date.now()}`,
      name,
      address,
      initials: initialsFrom(name),
      kind: 'other'
    });
    saveStore();
    renderRules();
    closeModal();
    showToast(`${name} added to your watchlist`);
    if (state.mode !== 'connect') syncMailbox({ silent: true });
  });
  $('#modalBackdrop').addEventListener('click', (event) => {
    if (event.target === event.currentTarget || event.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('#modalBackdrop').classList.contains('open')) closeModal();
  });
  setInterval(updateSyncStatus, 30000);
  setInterval(() => {
    if (state.mode === 'live' && !document.hidden) syncMailbox({ silent: true });
  }, 5 * 60 * 1000);
}

bindEvents();
restoreSession();
