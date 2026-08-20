/* Mailwatch — watchlist matching and mailbox providers (Gmail + Outlook). */

const DEFAULT_WATCHLIST = [
  {
    id: 'school',
    name: 'UNB Fredericton',
    shortName: 'UNB',
    initials: 'UN',
    kind: 'school',
    domains: ['unb.ca', 'unbsu.ca'],
    nameHints: [
      'university of new brunswick',
      'unb fredericton',
      'unb registrar',
      'unb student'
    ]
  },
  {
    id: 'ircc',
    name: 'IRCC',
    shortName: 'IRCC',
    initials: 'IR',
    kind: 'ircc',
    domains: [
      'cic.gc.ca',
      'ircc.gc.ca',
      'ircc.canada.ca',
      'apps.cic.gc.ca'
    ],
    nameHints: [
      'immigration, refugees and citizenship',
      'citizenship and immigration canada',
      'ircc'
    ]
  }
];

const ACTION_RE = /biometrics|instruction letter|action required|action needed|documents? (required|requested|missing)|request for (documents|information)|appointment|interview|medical exam|passport request|please respond|respond by|required action/i;
const DEADLINE_RE = /deadline|due on|payment due|tuition|fees due|balance due|overdue|final notice|pay now|due date/i;
const UPDATE_RE = /status (has been )?updated|application status|we received|decision|correspondence|update on your/i;
const WELCOME_RE = /welcome|orientation|getting started/i;

function decodeBase64Url(data = '') {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function htmlToText(html = '') {
  const cleaned = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const area = document.createElement('textarea');
  area.innerHTML = cleaned;
  return area.value.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseFromHeader(value = '') {
  const trimmed = String(value).trim();
  const angled = trimmed.match(/^(.*)<([^>]+)>\s*$/);
  if (angled) {
    return {
      name: angled[1].replace(/^["']|["']$/g, '').trim() || angled[2],
      email: angled[2].trim().toLowerCase()
    };
  }
  if (trimmed.includes('@')) {
    return { name: trimmed, email: trimmed.toLowerCase() };
  }
  return { name: trimmed || 'Unknown', email: '' };
}

function emailDomain(address = '') {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : address.slice(at + 1).toLowerCase();
}

function domainMatches(address, domains) {
  const domain = emailDomain(address);
  if (!domain) return false;
  return domains.some((candidate) => {
    const needle = candidate.toLowerCase().replace(/^@/, '');
    return domain === needle || domain.endsWith(`.${needle}`);
  });
}

function classifyMessage({ subject = '', snippet = '', body = '' }) {
  const text = `${subject}\n${snippet}\n${body}`;
  if (ACTION_RE.test(text)) return { tag: 'Action', tagClass: 'tag-action', priority: true };
  if (DEADLINE_RE.test(text)) return { tag: 'Deadline', tagClass: 'tag-deadline', priority: true };
  if (UPDATE_RE.test(text)) return { tag: 'Update', tagClass: 'tag-update', priority: false };
  if (WELCOME_RE.test(text)) return { tag: 'Welcome', tagClass: 'tag-reply', priority: false };
  return { tag: 'Info', tagClass: 'tag-info', priority: false };
}

function matchWatchlist(fromName, fromEmail, watchlist) {
  const name = String(fromName || '').toLowerCase();
  for (const rule of watchlist) {
    if (domainMatches(fromEmail, rule.domains || [])) return rule;
    if ((rule.nameHints || []).some((hint) => name.includes(hint.toLowerCase()))) return rule;
  }
  return null;
}

function formatShortDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startToday - startDate) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function formatFullDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function gmailQueryFor(watchlist) {
  const parts = [];
  for (const rule of watchlist) {
    for (const domain of rule.domains || []) {
      parts.push(`from:${domain}`);
    }
    for (const hint of rule.nameHints || []) {
      parts.push(`from:"${hint}"`);
    }
  }
  return parts.join(' OR ');
}

function outlookSearchFor(watchlist) {
  const parts = [];
  for (const rule of watchlist) {
    for (const domain of rule.domains || []) parts.push(`from:${domain}`);
    for (const hint of rule.nameHints || []) parts.push(`from:"${hint}"`);
  }
  return parts.join(' OR ');
}

function collectGmailParts(part, bucket = []) {
  if (!part) return bucket;
  if (part.body?.data && (part.mimeType === 'text/plain' || part.mimeType === 'text/html')) {
    bucket.push({ mime: part.mimeType, data: part.body.data });
  }
  (part.parts || []).forEach((child) => collectGmailParts(child, bucket));
  return bucket;
}

function extractGmailBody(payload) {
  const parts = collectGmailParts(payload);
  const html = parts.find((part) => part.mime === 'text/html');
  const plain = parts.find((part) => part.mime === 'text/plain');
  if (html) return htmlToText(decodeBase64Url(html.data));
  if (plain) return decodeBase64Url(plain.data);
  if (payload?.body?.data) return decodeBase64Url(payload.body.data);
  return '';
}

function extractGmailHtml(payload) {
  const parts = collectGmailParts(payload);
  const html = parts.find((part) => part.mime === 'text/html');
  const plain = parts.find((part) => part.mime === 'text/plain');
  if (html) return unwrapEmailHtml(decodeBase64Url(html.data));
  if (plain) return textToHtml(decodeBase64Url(plain.data));
  if (payload?.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    return /<[a-z][\s\S]*>/i.test(decoded) ? unwrapEmailHtml(decoded) : textToHtml(decoded);
  }
  return '';
}

function unwrapEmailHtml(html = '') {
  const withoutDoc = String(html)
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '');
  const body = withoutDoc.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (body ? body[1] : withoutDoc).trim();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function textToHtml(text = '') {
  const blocks = escapeHtml(text).split(/\n{2,}/).filter(Boolean);
  if (!blocks.length) return '<p></p>';
  return blocks.map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
}

function collectImageParts(part, bucket = []) {
  if (!part) return bucket;
  const mime = part.mimeType || '';
  const cidHeader = gmailHeader(part.headers || [], 'Content-ID') || gmailHeader(part.headers || [], 'Content-Id');
  const cid = String(cidHeader || '').replace(/[<>]/g, '').trim();
  if (mime.startsWith('image/') && (part.body?.attachmentId || part.body?.data)) {
    bucket.push({
      cid,
      mime,
      attachmentId: part.body.attachmentId,
      data: part.body.data
    });
  }
  (part.parts || []).forEach((child) => collectImageParts(child, bucket));
  return bucket;
}

function replaceCidImages(html, map) {
  return String(html)
    .replace(/src\s*=\s*(['"])cid:([^'"]+)\1/gi, (full, quote, cid) => {
      const key = String(cid).replace(/[<>]/g, '').toLowerCase();
      return map[key] ? `src=${quote}${map[key]}${quote}` : full;
    })
    .replace(/url\(\s*['"]?cid:([^'")\s]+)['"]?\s*\)/gi, (full, cid) => {
      const key = String(cid).replace(/[<>]/g, '').toLowerCase();
      return map[key] ? `url("${map[key]}")` : full;
    });
}

function sanitizeEmailHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = unwrapEmailHtml(html);
  const banned = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'VIDEO', 'AUDIO', 'SOURCE']);
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType !== 1) return;
      if (banned.has(child.tagName) || child.tagName === 'STYLE') {
        child.remove();
        return;
      }
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim();
        if (name.startsWith('on') || name === 'srcdoc' || name.startsWith('xlink')) {
          child.removeAttribute(attr.name);
          return;
        }
        if ((name === 'href' || name === 'src' || name === 'background' || name === 'action')
          && /^(javascript|vbscript|data:text\/html)/i.test(value)) {
          child.removeAttribute(attr.name);
        }
      });
      if (child.tagName === 'A') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      walk(child);
    });
  };
  walk(template.content);
  return template.innerHTML;
}

async function inlineGmailImages(token, messageId, payload, html) {
  const parts = collectImageParts(payload);
  const map = {};
  await Promise.all(parts.map(async (part) => {
    let data = part.data;
    if (!data && part.attachmentId) {
      try {
        const attachment = await gmailApi(token, `messages/${messageId}/attachments/${part.attachmentId}`);
        data = attachment.data;
      } catch {
        return;
      }
    }
    if (!data || !part.cid) return;
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    map[part.cid.toLowerCase()] = `data:${part.mime};base64,${normalized}`;
  }));
  return replaceCidImages(html, map);
}

async function inlineOutlookImages(token, messageId, html) {
  let attachments;
  try {
    attachments = await graphFetch(token, `me/messages/${encodeURIComponent(messageId)}/attachments`);
  } catch {
    return html;
  }
  const map = {};
  for (const attachment of attachments.value || []) {
    if (!attachment.contentBytes) continue;
    const mime = attachment.contentType || 'application/octet-stream';
    if (!String(mime).startsWith('image/') && !attachment.contentId) continue;
    const dataUrl = `data:${mime};base64,${attachment.contentBytes}`;
    if (attachment.contentId) map[String(attachment.contentId).replace(/[<>]/g, '').toLowerCase()] = dataUrl;
    if (attachment.name) map[String(attachment.name).toLowerCase()] = dataUrl;
  }
  return replaceCidImages(html, map);
}

async function loadReadableBody(message, token) {
  if (!message) return '<p></p>';
  if (message.provider === 'google' && token) {
    const id = String(message.id).replace(/^gmail:/, '');
    const raw = await gmailApi(token, `messages/${id}`, { format: 'full' });
    const html = await inlineGmailImages(token, id, raw.payload, extractGmailHtml(raw.payload));
    return sanitizeEmailHtml(html || textToHtml(message.body));
  }
  if (message.provider === 'microsoft' && token) {
    const id = String(message.id).replace(/^outlook:/, '');
    const raw = await graphFetch(token, `me/messages/${encodeURIComponent(id)}?$select=body,hasAttachments`);
    let html = raw.body?.contentType === 'html'
      ? unwrapEmailHtml(raw.body.content || '')
      : textToHtml(raw.body?.content || message.body || '');
    if (raw.hasAttachments) html = await inlineOutlookImages(token, id, html);
    return sanitizeEmailHtml(html);
  }
  return sanitizeEmailHtml(textToHtml(message.body || ''));
}

function gmailHeader(headers, name) {
  const match = (headers || []).find((header) => header.name.toLowerCase() === name.toLowerCase());
  return match ? match.value : '';
}

function normalizeMessage(partial) {
  const classification = classifyMessage(partial);
  const fromEmail = (partial.address || '').toLowerCase();
  const local = fromEmail.split('@')[0] || partial.sender || 'Mail';
  return {
    id: partial.id,
    accountId: partial.accountId,
    provider: partial.provider,
    category: partial.category,
    sender: partial.sender,
    senderFull: partial.senderFull || partial.sender,
    address: fromEmail,
    initials: partial.initials,
    subject: partial.subject || '(no subject)',
    snippet: (partial.snippet || partial.body || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    date: formatShortDate(partial.receivedAt),
    dateFull: formatFullDate(partial.receivedAt),
    receivedAt: new Date(partial.receivedAt).getTime() || 0,
    unread: Boolean(partial.unread),
    priority: classification.priority || Boolean(partial.priority),
    tag: classification.tag,
    tagClass: classification.tagClass,
    starred: Boolean(partial.starred),
    body: (partial.body || partial.snippet || '').trim(),
    webLink: partial.webLink || '',
    threadId: partial.threadId || ''
  };
}

async function gmailApi(token, path, params) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const error = new Error(`Gmail API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchGmailMessages(token, watchlist, accountId) {
  const query = gmailQueryFor(watchlist);
  const listed = await gmailApi(token, 'messages', { q: query, maxResults: '40' });
  const refs = listed.messages || [];
  const detailed = await Promise.all(refs.map(async (ref) => {
    try {
      return await gmailApi(token, `messages/${ref.id}`, { format: 'full' });
    } catch {
      return null;
    }
  }));

  return detailed.filter(Boolean).map((raw) => {
    const headers = raw.payload?.headers || [];
    const from = parseFromHeader(gmailHeader(headers, 'From'));
    const rule = matchWatchlist(from.name, from.email, watchlist);
    if (!rule) return null;
    const subject = gmailHeader(headers, 'Subject');
    const dateHeader = gmailHeader(headers, 'Date');
    const body = extractGmailBody(raw.payload);
    return normalizeMessage({
      id: `gmail:${raw.id}`,
      accountId,
      provider: 'google',
      category: rule.kind,
      sender: rule.kind === 'school' ? (from.name || rule.name) : rule.name,
      senderFull: from.name || rule.name,
      address: from.email,
      initials: rule.initials,
      subject,
      snippet: raw.snippet || '',
      body,
      receivedAt: dateHeader || Number(raw.internalDate),
      unread: (raw.labelIds || []).includes('UNREAD'),
      starred: (raw.labelIds || []).includes('STARRED'),
      webLink: `https://mail.google.com/mail/u/0/#inbox/${raw.threadId || raw.id}`,
      threadId: raw.threadId
    });
  }).filter(Boolean);
}

async function fetchGmailProfile(token) {
  const [profile, userinfo] = await Promise.all([
    gmailApi(token, 'profile'),
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    }).then((response) => (response.ok ? response.json() : {}))
  ]);
  return {
    email: userinfo.email || profile.emailAddress || '',
    name: userinfo.name || userinfo.given_name || profile.emailAddress || 'Gmail',
    givenName: userinfo.given_name || '',
    picture: userinfo.picture || ''
  };
}

async function graphFetch(token, path, extraHeaders = {}) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  });
  if (!response.ok) {
    const error = new Error(`Microsoft Graph ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchOutlookMessages(token, watchlist, accountId) {
  const select = 'id,subject,from,receivedDateTime,bodyPreview,isRead,inferenceClassification,webLink,body,flag,importance';
  let records = [];
  try {
    const search = encodeURIComponent(`"${outlookSearchFor(watchlist)}"`);
    const data = await graphFetch(
      token,
      `me/messages?$search=${search}&$top=40&$select=${select}`,
      { ConsistencyLevel: 'eventual' }
    );
    records = data.value || [];
  } catch {
    const data = await graphFetch(token, `me/messages?$top=80&$orderby=receivedDateTime desc&$select=${select}`);
    records = data.value || [];
  }

  return records.map((raw) => {
    const fromEmail = (raw.from?.emailAddress?.address || '').toLowerCase();
    const fromName = raw.from?.emailAddress?.name || fromEmail;
    const rule = matchWatchlist(fromName, fromEmail, watchlist);
    if (!rule) return null;
    const body = raw.body?.contentType === 'html'
      ? htmlToText(raw.body.content || '')
      : (raw.body?.content || raw.bodyPreview || '');
    return normalizeMessage({
      id: `outlook:${raw.id}`,
      accountId,
      provider: 'microsoft',
      category: rule.kind,
      sender: rule.kind === 'school' ? (fromName || rule.name) : rule.name,
      senderFull: fromName || rule.name,
      address: fromEmail,
      initials: rule.initials,
      subject: raw.subject,
      snippet: raw.bodyPreview || '',
      body,
      receivedAt: raw.receivedDateTime,
      unread: raw.isRead === false,
      starred: raw.flag?.flagStatus === 'flagged' || raw.importance === 'high',
      priority: raw.inferenceClassification === 'focused',
      webLink: raw.webLink || 'https://outlook.live.com/mail/'
    });
  }).filter(Boolean);
}

async function fetchOutlookProfile(token) {
  const me = await graphFetch(token, 'me?$select=displayName,givenName,mail,userPrincipalName');
  return {
    email: me.mail || me.userPrincipalName || '',
    name: me.displayName || me.givenName || 'Outlook',
    givenName: me.givenName || '',
    picture: ''
  };
}

function demoMessages(watchlist) {
  const school = watchlist.find((rule) => rule.kind === 'school') || watchlist[0];
  const ircc = watchlist.find((rule) => rule.kind === 'ircc') || watchlist[1];
  const now = Date.now();
  const hours = (value) => new Date(now - value * 3600000).toISOString();
  const samples = [
    {
      id: 'demo-ircc-1',
      category: 'ircc',
      sender: 'IRCC',
      senderFull: 'Immigration, Refugees and Citizenship Canada',
      address: 'no-reply@cic.gc.ca',
      initials: ircc.initials,
      subject: 'Biometrics instruction letter available',
      snippet: 'Your application requires action. Review the instructions and book your appointment.',
      body: 'A new biometrics instruction letter is available in your IRCC account. Please review the letter carefully and follow the instructions within the timeframe provided.\n\nSign in to your IRCC secure account at canada.ca to view the full notice.\n\nThis is a sample message shown in demo mode.',
      receivedAt: hours(4),
      unread: true,
      provider: 'demo'
    },
    {
      id: 'demo-school-1',
      category: 'school',
      sender: 'UNB Student Accounts',
      senderFull: 'UNB Student Accounts & Receivables',
      address: 'stufees@unb.ca',
      initials: school.initials,
      subject: 'Tuition payment deadline — Fall 2026',
      snippet: 'Your next payment is due on September 5. View your balance and payment options.',
      body: 'This is a reminder that Fall 2026 tuition is due on September 5, 2026. You can view your current balance and payment options through the UNB student accounts portal.\n\nQuestions: stufees@unb.ca\n\nThis is a sample message shown in demo mode.',
      receivedAt: hours(22),
      unread: true,
      provider: 'demo'
    },
    {
      id: 'demo-ircc-2',
      category: 'ircc',
      sender: 'IRCC',
      senderFull: 'Immigration, Refugees and Citizenship Canada',
      address: 'client-update@cic.gc.ca',
      initials: ircc.initials,
      subject: 'Your application status has been updated',
      snippet: 'There has been a change to your application. Sign in to view the latest update.',
      body: 'There has been a change to the status of your application. Sign in to your IRCC secure account to view the latest details.\n\nThis is an automated message. Please do not reply.\n\nThis is a sample message shown in demo mode.',
      receivedAt: hours(70),
      unread: true,
      provider: 'demo'
    },
    {
      id: 'demo-school-2',
      category: 'school',
      sender: 'UNB Registrar',
      senderFull: 'University of New Brunswick Registrar (Fredericton)',
      address: 'registrar@unb.ca',
      initials: school.initials,
      subject: 'Your Fall 2026 timetable is ready',
      snippet: 'Your class schedule is now available in the student portal.',
      body: 'Your Fall 2026 timetable is now available. Please sign in to the student portal to review your classes, rooms, and start times.\n\nIf anything looks incorrect, contact the Registrar before the first week of classes: registrar@unb.ca\n\nThis is a sample message shown in demo mode.',
      receivedAt: hours(96),
      unread: false,
      provider: 'demo'
    },
    {
      id: 'demo-school-3',
      category: 'school',
      sender: 'UNB ISAO',
      senderFull: 'International Student Advisor’s Office',
      address: 'isao@unb.ca',
      initials: school.initials,
      subject: 'Study permit and arrival checklist',
      snippet: 'A few important immigration and campus steps before classes begin.',
      body: 'The International Student Advisor’s Office has put together a checklist covering study permit conditions, arrival in Fredericton, and campus resources.\n\nPlease read it carefully and reach out to isao@unb.ca if you have questions.\n\nThis is a sample message shown in demo mode.',
      receivedAt: hours(140),
      unread: false,
      provider: 'demo'
    },
    {
      id: 'demo-ircc-3',
      category: 'ircc',
      sender: 'IRCC',
      senderFull: 'Immigration, Refugees and Citizenship Canada',
      address: 'updates@cic.gc.ca',
      initials: ircc.initials,
      subject: 'We received your application',
      snippet: 'Keep this message for your records. Your application number is available online.',
      body: 'We have received your application. Keep this message for your records and use your application number when contacting us.\n\nYou can check your application status through your IRCC secure account.\n\nThis is a sample message shown in demo mode.',
      receivedAt: hours(190),
      unread: false,
      provider: 'demo'
    }
  ];
  return samples.map((item) => normalizeMessage(item));
}

window.MailwatchMail = {
  DEFAULT_WATCHLIST,
  matchWatchlist,
  domainMatches,
  gmailQueryFor,
  fetchGmailMessages,
  fetchGmailProfile,
  fetchOutlookMessages,
  fetchOutlookProfile,
  demoMessages,
  formatShortDate,
  formatFullDate,
  loadReadableBody,
  textToHtml,
  sanitizeEmailHtml
};
