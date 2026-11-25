import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

interface FirebaseAppletConfig {
  projectId: string;
}

function loadFirebaseProjectId(): string {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as FirebaseAppletConfig;
    return parsed.projectId || '';
  } catch {
    return '';
  }
}

const FIREBASE_PROJECT_ID = loadFirebaseProjectId();

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!response.ok) {
    throw new Error('Failed to fetch Firebase verification certificates.');
  }
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await response.json()) as Record<string, string>;
  certsExpiresAt = now + maxAgeSeconds * 1000;
  return cachedCerts;
}

interface VerifiedTokenPayload {
  uid: string;
  emailVerified: boolean;
}

async function verifyFirebaseIdToken(token: string): Promise<VerifiedTokenPayload> {
  if (!FIREBASE_PROJECT_ID) {
    throw new Error('Firebase project configuration missing.');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format.');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid token algorithm.');
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Unknown signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValidSignature = verifier.verify(cert, Buffer.from(signatureB64, 'base64url'));
  if (!isValidSignature) {
    throw new Error('Invalid token signature.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Token issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Invalid token subject.');
  }
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new Error('Token expired.');
  }
  if (payload.email_verified !== true) {
    throw new Error('Email verification required.');
  }

  return {
    uid: payload.sub,
    emailVerified: true,
  };
}

function detectImageExtension(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/maps-key', (_req, res) => {
    res.json({
      mapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || '',
    });
  });

  app.post('/api/assistant/chat', express.json({ limit: '64kb' }), async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'Assistant is unavailable because GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
      return;
    }

    const body = (req.body || {}) as {
      message?: unknown;
      history?: unknown;
      context?: {
        isSignedIn?: unknown;
        role?: unknown;
        activeTab?: unknown;
      };
    };

    const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
    if (!rawMessage || rawMessage.length > 1500) {
      res.status(400).json({ error: 'Please enter a message between 1 and 1500 characters.' });
      return;
    }

    const rawHistory = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const sanitizedHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

    for (const item of rawHistory) {
      if (!item || typeof item !== 'object') continue;
      const role = (item as { role?: unknown }).role;
      const text = (item as { text?: unknown }).text;
      if ((role !== 'user' && role !== 'model') || typeof text !== 'string') continue;
      const trimmedText = text.trim().slice(0, 2000);
      if (!trimmedText) continue;

      // History passed to chats.create must start with 'user' and alternate roles
      if (sanitizedHistory.length === 0 && role !== 'user') continue;
      const prevRole = sanitizedHistory[sanitizedHistory.length - 1]?.role;
      if (prevRole === role) continue;

      sanitizedHistory.push({ role, parts: [{ text: trimmedText }] });
    }

    // Ensure history ends on 'model' before calling chat.sendMessage
    if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
      sanitizedHistory.pop();
    }

    const isSignedIn = body.context?.isSignedIn === true;
    const roleLabel = body.context?.role === 'provider' ? 'provider' : 'seeker';
    const tabLabel =
      typeof body.context?.activeTab === 'string'
        ? body.context.activeTab.slice(0, 40)
        : 'discover';

    const systemInstruction = [
      'You are NearCraft Guide, a friendly, practical website assistant embedded inside the NearCraft web app.',
      'Your sole job is to help visitors and signed-in users navigate and use NearCraft effortlessly.',
      'Keep answers concise (2 to 4 short sentences or up to 4 crisp numbered steps), warm, and specific to exact NearCraft UI labels.',
      'Never invent nonexistent buttons or features, and never mention internal APIs, secrets, or backend implementation details.',
      '',
      `Current user context: signedIn=${isSignedIn ? 'yes' : 'no'}, activeRole=${roleLabel}, currentPage=${tabLabel}.`,
      '',
      'NearCraft product guide:',
      '1. Sign-In & Roles: On the landing page, users choose Customer Access (to find local services, book, and pay) or Provider Studio (to register a shop). Signed-in users can switch anytime via the top-right account menu -> Switch to Customer Mode / Switch to Provider Studio.',
      '2. Finding Services (Find Services tab): Use the searchable Service Type directory (15 categories and 290+ local services from Shopping, Salons, Restaurants, Healthcare, Travel, Education, Finance, Repairs, Government, Hospitality, and Religious Places) by typing just the first letter (like B, C, G, H, S), or type any shop/dish/service keyword.',
      '3. Location & Radius: Click "Share Live GPS" or type a neighborhood/city in "Your Live Location / Area", or pan the map and click "Search This Map Area". Drag the "Search Radius" slider (1 km to 20 km) to limit markers on the map, or click Clear for Any distance. Sort results by Nearest or Top Rated.',
      '4. Google Maps vs Partners: Filter by All Services, Google Maps (real-world venues with hours, phone, reviews, photos, and directions), or Partners (Aadhaar-verified NearCraft shops with live menus and pricing).',
      '5. Inspecting, Booking & Paying: Click any pin or list card to open Shop Info, Photos (click a photo for fullscreen preview), and Reviews. For NearCraft Partners, add itemized services with "+ Add" and click "Order & View Bill" (In-App Payment or Pay at Counter) to view a receipt under My Bills, or click "Schedule & Chat" for real-time messaging & appointment booking. After a completed visit or paid bill, submit a 1-5 star rating & review.',
      '6. Provider Studio: Switch to Provider Studio -> open "Shop & KYC" to complete 12-digit Aadhaar verification, pin shop location, upload up to 3 photos, and add numbered catalog items with prices. Manage chats under "Inquiries", appointments under "Bookings", and customer invoices under "Bills & Sales".',
    ].join('\n');

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history: sanitizedHistory,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const result = await chat.sendMessage({ message: rawMessage });
      const reply = (result.text ?? '').trim();
      if (!reply) {
        res.status(502).json({ error: 'Assistant returned an empty response. Please try again.' });
        return;
      }

      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Assistant request failed.';
      let status = 500;
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        status = 429;
      } else if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403') || msg.includes('400')) {
        status = 400;
      }
      res.status(status).json({ error: msg });
    }
  });

  app.post(
    '/api/uploads',
    express.raw({
      type: ['image/jpeg', 'image/png', 'image/webp'],
      limit: '3mb',
    }),
    async (req, res) => {
      try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (!token) {
          res.status(401).json({ error: 'Authentication required.' });
          return;
        }
        await verifyFirebaseIdToken(token);

        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          res.status(400).json({ error: 'Empty image payload.' });
          return;
        }

        const ext = detectImageExtension(req.body);
        if (!ext) {
          res.status(400).json({ error: 'Only valid JPEG, PNG, or WebP images are allowed.' });
          return;
        }

        const filename = `${crypto.randomUUID()}.${ext}`;
        const targetPath = path.resolve(UPLOADS_DIR, filename);
        if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
          res.status(400).json({ error: 'Invalid upload path.' });
          return;
        }

        await fs.promises.writeFile(targetPath, req.body);
        res.status(201).json({ url: `/uploads/${filename}` });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        const status = message.includes('Token') || message.includes('Authentication') || message.includes('Email') ? 401 : 400;
        res.status(status).json({ error: message });
      }
    }
  );

  app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename)) {
      res.status(404).end();
      return;
    }
    const targetPath = path.resolve(UPLOADS_DIR, filename);
    if (!targetPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(targetPath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(targetPath);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
