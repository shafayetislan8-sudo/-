import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '64kb' }));

const FIREBASE_PROJECT_ID = 'gen-lang-client-0047498127';
const FIREBASE_API_KEY = 'AIzaSyAT4OMOdcu1iJJGBngF8MROFJSQOOso2qI';
const DEFAULT_PRIMARY_ADMIN_EMAIL = 'shafayetislam28122006@gmail.com';
const PRIMARY_ADMIN_EMAIL = (
  process.env.PRIMARY_ADMIN_EMAIL?.trim() || DEFAULT_PRIMARY_ADMIN_EMAIL
).toLowerCase();

function isPrimaryAdminConfigured(): boolean {
  return (
    Boolean(PRIMARY_ADMIN_EMAIL) &&
    PRIMARY_ADMIN_EMAIL !== 'my_new_admin_email' &&
    PRIMARY_ADMIN_EMAIL.includes('@')
  );
}

async function verifyAdminCaller(authHeader: string | undefined): Promise<{ ok: boolean; email?: string }> {
  if (!authHeader?.startsWith('Bearer ') || !FIREBASE_API_KEY || !isPrimaryAdminConfigured()) {
    return { ok: false };
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return { ok: false };

  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!resp.ok) return { ok: false };
  const data = (await resp.json()) as {
    users?: {
      email?: string;
      emailVerified?: boolean;
      providerUserInfo?: { providerId?: string }[];
    }[];
  };
  const user = data.users?.[0];
  const hasGoogle = Boolean(user?.providerUserInfo?.some((p) => p.providerId === 'google.com'));
  if (!user || !user.emailVerified || !hasGoogle || user.email?.toLowerCase() !== PRIMARY_ADMIN_EMAIL) {
    return { ok: false };
  }
  return { ok: true, email: user.email };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    projectId: FIREBASE_PROJECT_ID,
    firebaseConfigured: true,
    whatsappConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
  });
});

app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const authCheck = await verifyAdminCaller(req.headers.authorization);
    if (!authCheck.ok) {
      res.status(403).json({ configured: false, error: 'Unauthorized' });
      return;
    }
    res.json({ configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN) });
  } catch {
    res.status(500).json({ configured: false });
  }
});

/**
 * Server-side WhatsApp Business Cloud API proxy.
 * Never reports a message as sent unless Meta Graph API confirms HTTP 2xx with a message ID.
 */
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const authCheck = await verifyAdminCaller(req.headers.authorization);
    if (!authCheck.ok) {
      res.status(403).json({ sent: false, error: 'Unauthorized: verified primary Admin token required.' });
      return;
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      res.status(400).json({
        sent: false,
        error: 'WHATSAPP_ACCESS_TOKEN is not configured on the server.',
      });
      return;
    }

    const { to, phoneNumberId, message } = req.body as {
      to?: string;
      phoneNumberId?: string;
      message?: string;
    };

    if (!to || !/^\+?[1-9]\d{7,14}$/.test(to.trim())) {
      res.status(400).json({ sent: false, error: 'Valid E.164 recipient phone number is required.' });
      return;
    }
    if (!phoneNumberId || !/^\d{5,32}$/.test(phoneNumberId.trim())) {
      res.status(400).json({ sent: false, error: 'Valid WhatsApp Phone Number ID is required.' });
      return;
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ sent: false, error: 'Message text is required.' });
      return;
    }

    const graphUrl = `https://graph.facebook.com/v20.0/${phoneNumberId.trim()}/messages`;
    const metaResp = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.trim().replace(/^\+/, ''),
        type: 'text',
        text: { body: message.trim().slice(0, 1000) },
      }),
    });

    const metaJson = (await metaResp.json()) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };

    if (!metaResp.ok || !metaJson.messages?.[0]?.id) {
      res.status(502).json({
        sent: false,
        error: metaJson.error?.message || 'WhatsApp Cloud API rejected the message.',
      });
      return;
    }

    res.json({ sent: true, messageId: metaJson.messages[0].id });
  } catch (err) {
    res.status(500).json({
      sent: false,
      error: err instanceof Error ? err.message : 'Server error sending WhatsApp message.',
    });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Mess Manager Pro server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
