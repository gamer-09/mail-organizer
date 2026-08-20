const path = require('path');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 4173;

app.set('trust proxy', true);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mailwatch' });
});

app.get('/api/public-config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
    origin: `${req.protocol}://${req.get('host')}`
  });
});

app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: 'index.html'
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mailwatch listening on http://0.0.0.0:${PORT}`);
});
