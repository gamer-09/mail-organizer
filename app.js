const messages = [
  {
    id: 'ircc-1',
    category: 'ircc',
    sender: 'IRCC',
    senderFull: 'Immigration, Refugees and Citizenship Canada',
    address: 'no-reply@cic.gc.ca',
    initials: 'IR',
    subject: 'Biometrics instruction letter available',
    snippet: 'Your application requires action. Review the instructions and book your appointment.',
    date: 'Today',
    dateFull: 'Today at 9:18 AM',
    unread: true,
    priority: true,
    tag: 'Action',
    tagClass: 'tag-action',
    starred: false,
    body: 'Hello Jordan,\n\nA new biometrics instruction letter is available in your IRCC account. Please review the letter carefully and follow the instructions within the timeframe provided.\n\nSign in to your IRCC secure account to view the full notice.'
  },
  {
    id: 'school-1',
    category: 'school',
    sender: 'Harbourview College',
    senderFull: 'Harbourview College Student Services',
    address: 'studentservices@harbourview.edu',
    initials: 'HV',
    subject: 'Tuition payment deadline — Fall 2026',
    snippet: 'Your next payment is due on September 5. View your balance and payment options.',
    date: 'Yesterday',
    dateFull: 'Yesterday at 3:42 PM',
    unread: true,
    priority: true,
    tag: 'Deadline',
    tagClass: 'tag-deadline',
    starred: true,
    body: 'Hi Jordan,\n\nThis is a friendly reminder that your Fall 2026 tuition payment is due on September 5, 2026. You can view your current balance and payment options in the student portal.\n\nPlease contact Student Services if you have questions.'
  },
  {
    id: 'ircc-2',
    category: 'ircc',
    sender: 'IRCC',
    senderFull: 'Immigration, Refugees and Citizenship Canada',
    address: 'client-update@cic.gc.ca',
    initials: 'IR',
    subject: 'Your application status has been updated',
    snippet: 'There has been a change to your application. Sign in to view the latest update.',
    date: 'Aug 18',
    dateFull: 'August 18, 2026 at 11:06 AM',
    unread: true,
    priority: false,
    tag: 'Update',
    tagClass: 'tag-update',
    starred: false,
    body: 'Hello Jordan,\n\nThere has been a change to the status of your application. Sign in to your IRCC secure account to view the latest details.\n\nThis is an automated message. Please do not reply to this email.'
  },
  {
    id: 'school-2',
    category: 'school',
    sender: 'Harbourview College',
    senderFull: 'Harbourview College Registrar',
    address: 'registrar@harbourview.edu',
    initials: 'HV',
    subject: 'Your Fall 2026 timetable is ready',
    snippet: 'Your class schedule is now available in the student portal.',
    date: 'Aug 17',
    dateFull: 'August 17, 2026 at 8:30 AM',
    unread: false,
    priority: false,
    tag: 'Info',
    tagClass: 'tag-info',
    starred: false,
    body: 'Hi Jordan,\n\nYour Fall 2026 timetable is now available. Please sign in to the student portal to review your classes, rooms, and start times.\n\nIf anything looks incorrect, contact the Registrar before the first week of classes.'
  },
  {
    id: 'school-3',
    category: 'school',
    sender: 'Harbourview College',
    senderFull: 'Harbourview College Admissions',
    address: 'admissions@harbourview.edu',
    initials: 'HV',
    subject: 'Welcome to the Fall 2026 term',
    snippet: 'A few important dates and resources before classes begin.',
    date: 'Aug 15',
    dateFull: 'August 15, 2026 at 1:16 PM',
    unread: false,
    priority: false,
    tag: 'Welcome',
    tagClass: 'tag-reply',
    starred: false,
    body: 'Welcome, Jordan!\n\nThe Fall 2026 term is almost here. We have collected orientation details, campus resources, and key dates in the student hub.\n\nWe look forward to seeing you on campus.'
  },
  {
    id: 'ircc-3',
    category: 'ircc',
    sender: 'IRCC',
    senderFull: 'Immigration, Refugees and Citizenship Canada',
    address: 'updates@cic.gc.ca',
    initials: 'IR',
    subject: 'We received your application',
    snippet: 'Keep this message for your records. Your application number is available online.',
    date: 'Aug 12',
    dateFull: 'August 12, 2026 at 4:55 PM',
    unread: false,
    priority: false,
    tag: 'Update',
    tagClass: 'tag-update',
    starred: false,
    body: 'Hello Jordan,\n\nWe have received your application. Keep this message for your records and use your application number when contacting us.\n\nYou can check your application status through your IRCC secure account.'
  }
];

let rules = [
  { name: 'My school', address: 'harbourview.edu', initials: 'HV', kind: 'school' },
  { name: 'IRCC', address: 'cic.gc.ca', initials: 'IR', kind: 'ircc' }
];

const state = {
  activeFilter: 'all',
  query: '',
  currentView: 'overview',
  selectedMessage: null,
  toastTimer: null
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

function getVisibleMessages() {
  const normalizedQuery = state.query.trim().toLowerCase();
  return messages.filter((message) => {
    const matchesFilter = state.activeFilter === 'all'
      || state.activeFilter === 'priority' && message.priority
      || state.activeFilter === message.category;
    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;
    return [message.sender, message.senderFull, message.address, message.subject, message.snippet]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

function renderMessages() {
  const visibleMessages = getVisibleMessages();
  const list = $('#messageList');
  const emptyState = $('#emptyState');
  $('#messageCount').textContent = visibleMessages.length;

  list.innerHTML = visibleMessages.map((message) => `
    <article class="message-row ${message.unread ? 'unread' : ''}" data-message="${message.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(message.subject)}">
      <span class="message-avatar ${message.category === 'school' ? 'school-mark' : 'ircc-mark'}">${escapeHtml(message.initials)}</span>
      <span class="sender-cell"><strong>${escapeHtml(message.sender)}</strong>${message.unread ? '<span class="unread-dot" aria-label="Unread"></span>' : ''}</span>
      <span class="subject-cell"><strong>${escapeHtml(message.subject)}</strong><span>${escapeHtml(message.snippet)}</span></span>
      <span class="message-tags"><span class="tag ${escapeHtml(message.tagClass)}">${escapeHtml(message.tag)}</span></span>
      <span class="message-date">${escapeHtml(message.date)}</span>
      <button class="star-button ${message.starred ? 'starred' : ''}" data-star-message="${message.id}" aria-label="${message.starred ? 'Unstar' : 'Star'} message">
        <svg viewBox="0 0 24 24" fill="${message.starred ? 'currentColor' : 'none'}"><path d="m12 4.25 2.36 4.78 5.28.77-3.82 3.72.9 5.26L12 16.3l-4.72 2.48.9-5.26-3.82-3.72 5.28-.77L12 4.25Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
      </button>
    </article>
  `).join('');

  list.classList.toggle('hidden', visibleMessages.length === 0);
  emptyState.classList.toggle('hidden', visibleMessages.length !== 0);
  updateStats();
}

function updateStats() {
  const unread = messages.filter((message) => message.unread).length;
  const attention = messages.filter((message) => message.priority && message.unread).length;
  $('#unreadStat').textContent = unread;
  $('#attentionStat').textContent = attention;
  $('.attention-total').textContent = attention;
  $('.nav-count').textContent = attention;
}

function renderRules() {
  $('#ruleList').innerHTML = rules.map((rule) => `
    <div class="rule-row">
      <span class="rule-avatar ${rule.kind === 'school' ? 'school-avatar' : rule.kind === 'ircc' ? 'ircc-avatar' : ''}">${escapeHtml(rule.initials)}</span>
      <div class="rule-copy"><strong>${escapeHtml(rule.name)}</strong><span>${escapeHtml(rule.address)}</span></div>
      <span class="rule-status"></span>
    </div>
  `).join('');
  $('.nav-item[data-view="senders"] span:last-child');
}

function updateFilterTabs() {
  $$('.filter-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.filter === state.activeFilter));
}

function showToast(message) {
  const toast = $('#toast');
  $('#toastMessage').textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
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

function showMessage(messageId) {
  const message = messages.find((item) => item.id === messageId);
  if (!message) return;
  state.selectedMessage = messageId;
  const avatar = $('#detailAvatar');
  avatar.textContent = message.initials;
  avatar.className = `detail-avatar ${message.category === 'school' ? 'school-mark' : 'ircc-mark'}`;
  $('#detailCategory').textContent = message.category === 'school' ? 'MY SCHOOL' : 'IRCC';
  $('#detailDate').textContent = message.dateFull;
  $('#messageModalTitle').textContent = message.subject;
  $('#detailSender').textContent = `${message.senderFull} <${message.address}>`;
  $('#detailBody').textContent = message.body;
  $('#detailStar').classList.toggle('starred', message.starred);
  $('#detailStar svg').setAttribute('fill', message.starred ? 'currentColor' : 'none');
  $('#detailStar').setAttribute('aria-label', message.starred ? 'Unstar message' : 'Star message');
  $('#detailReadButton').textContent = message.unread ? 'Mark as read' : 'Mark as unread';
  openModal('messageModal');
}

function setMessageStar(messageId) {
  const message = messages.find((item) => item.id === messageId);
  if (!message) return;
  message.starred = !message.starred;
  renderMessages();
  if (state.selectedMessage === messageId) {
    $('#detailStar').classList.toggle('starred', message.starred);
    $('#detailStar svg').setAttribute('fill', message.starred ? 'currentColor' : 'none');
  }
  showToast(message.starred ? 'Message starred' : 'Removed star');
}

function toggleRead(messageId) {
  const message = messages.find((item) => item.id === messageId);
  if (!message) return;
  message.unread = !message.unread;
  renderMessages();
  if (state.selectedMessage === messageId) {
    $('#detailReadButton').textContent = message.unread ? 'Mark as read' : 'Mark as unread';
  }
  showToast(message.unread ? 'Marked as unread' : 'Marked as read');
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
    $('.inbox-heading p').textContent = 'The messages most likely to need a next step.';
    updateFilterTabs();
    renderMessages();
  } else if (view === 'overview') {
    state.activeFilter = 'all';
    $('#inboxTitle').textContent = 'Your watchlist';
    $('.inbox-heading p').textContent = 'Messages from the people and teams you care about.';
    updateFilterTabs();
    renderMessages();
  } else if (view === 'senders') {
    state.activeFilter = 'all';
    $('#inboxTitle').textContent = 'Your watchlist';
    $('.inbox-heading p').textContent = 'Messages from the people and teams you care about.';
    updateFilterTabs();
    renderMessages();
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

function syncMailbox() {
  const button = $('#syncButton');
  if (button.classList.contains('syncing')) return;
  button.classList.add('syncing');
  button.disabled = true;
  $('#syncButtonText').textContent = 'Checking…';
  $('#syncStatus').textContent = 'Checking mailbox…';
  setTimeout(() => {
    button.classList.remove('syncing');
    button.disabled = false;
    $('#syncButtonText').textContent = 'Sync now';
    $('#syncStatus').textContent = 'Synced just now';
    showToast('Mailbox is up to date');
  }, 1150);
}

function connectMailbox() {
  closeModal();
  $('#syncStatus').textContent = 'Synced just now';
  showToast('Mailbox connected — watchlist is active');
}

// Initial render
renderMessages();
renderRules();

// Navigation
$$('.nav-item').forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));

// Inbox filtering and search
$$('.filter-tab').forEach((tab) => tab.addEventListener('click', () => {
  state.activeFilter = tab.dataset.filter;
  state.currentView = 'overview';
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === 'overview'));
  $('#breadcrumbCurrent').textContent = 'Overview';
  $('#inboxTitle').textContent = 'Your watchlist';
  $('.inbox-heading p').textContent = 'Messages from the people and teams you care about.';
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
    setMessageStar(starButton.dataset.starMessage);
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

$$('.attention-item').forEach((item) => item.addEventListener('click', () => showMessage(item.dataset.message)));

// Mail actions
$('#markAllRead').addEventListener('click', () => {
  const unread = messages.filter((message) => message.unread);
  if (!unread.length) {
    showToast('Everything is already read');
    return;
  }
  messages.forEach((message) => { message.unread = false; });
  renderMessages();
  showToast(`${unread.length} messages marked as read`);
});
$('#syncButton').addEventListener('click', syncMailbox);
$('#notificationButton').addEventListener('click', () => {
  setView('priority');
  showToast('Showing your 2 priority messages');
});
$('#viewAllButton').addEventListener('click', () => setView('senders'));

// Sidebar on narrow screens
$('#openSidebar').addEventListener('click', () => {
  $('#sidebar').classList.add('open');
  $('#sidebarOverlay').classList.add('open');
});
$('#closeSidebar').addEventListener('click', closeSidebar);
$('#sidebarOverlay').addEventListener('click', closeSidebar);

// Modals
$('#monitorButton').addEventListener('click', openSenderModal);
$('#addRuleButton').addEventListener('click', openSenderModal);
$('#editRulesButton').addEventListener('click', openSenderModal);
$('#changeMailboxButton').addEventListener('click', () => openModal('connectModal'));
$('#connectGmail').addEventListener('click', connectMailbox);
$('#settingsSaveButton').addEventListener('click', () => showToast('Preferences saved'));
$('#keywordButton').addEventListener('click', () => showToast('Keyword alerts are ready to configure next'));
$('#openOriginalButton').addEventListener('click', () => showToast('Gmail links will open here once OAuth is connected'));
$('#detailStar').addEventListener('click', () => {
  if (state.selectedMessage) setMessageStar(state.selectedMessage);
});
$('#detailReadButton').addEventListener('click', () => {
  if (state.selectedMessage) toggleRead(state.selectedMessage);
});

$('#senderForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const address = String(formData.get('address') || '').trim();
  const name = String(formData.get('name') || '').trim() || address.split('@')[0] || 'New sender';
  if (!address) return;
  const exists = rules.some((rule) => rule.address.toLowerCase() === address.toLowerCase());
  if (exists) {
    closeModal();
    showToast('That sender is already on your watchlist');
    return;
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'NW';
  rules.push({ name, address, initials, kind: 'other' });
  renderRules();
  closeModal();
  showToast(`${name} added to your watchlist`);
});

$('#modalBackdrop').addEventListener('click', (event) => {
  if (event.target === event.currentTarget || event.target.closest('[data-close-modal]')) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('#modalBackdrop').classList.contains('open')) closeModal();
});
