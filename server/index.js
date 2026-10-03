/**
 * ScribeAssist backend
 * ---------------------
 * A tiny, dependency-free Node HTTP server. It does two jobs:
 *   1. Serves the static frontend from /public
 *   2. Exposes POST /api/generate, which forwards a drafting request to
 *      Claude (Anthropic's Messages API) using an API key the user supplies
 *      in the browser for their own session. The key is never stored on
 *      the server or written to disk or logs.
 *
 * No npm dependencies are required — just Node's built-in http/https.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const LETTER_LABELS = {
  discharge: 'discharge summary',
  referral: 'referral letter',
  clinic: 'clinic letter',
};

function buildSystemPrompt(letterType) {
  const label = LETTER_LABELS[letterType] || 'clinical letter';
  return `You are a careful clinical documentation assistant helping a doctor draft a ${label}.

Rules:
- Use only the information given to you. Never invent clinical findings, results, names, dates, or history that were not provided.
- If information needed for a standard section is missing, write "[not documented]" rather than guessing.
- Use clear, professional, standard UK clinical letter style and structure.
- This draft will always be reviewed, edited, and approved by a doctor before use. You are producing a first draft only, not a final clinical document.
- Do not include any real patient-identifiable information beyond what is explicitly given — this is a demonstration tool and inputs should already be fictional or anonymised.
- Output only the letter text, with no preamble like "Here is the letter" and no markdown formatting.`;
}

function buildUserPrompt({ letterType, patientInfo, bullets, recipient }) {
  const label = LETTER_LABELS[letterType] || 'clinical letter';
  return [
    `Draft a ${label}.`,
    patientInfo ? `Patient details: ${patientInfo}` : '',
    recipient ? `Addressed to / recipient context: ${recipient}` : '',
    `Clinical bullet points to incorporate:`,
    bullets,
  ].filter(Boolean).join('\n\n');
}

function callClaude({ apiKey, systemPrompt, userPrompt }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const text = (parsed.content || [])
                .map((block) => block.text || '')
                .join('');
              resolve({ ok: true, text });
            } else {
              resolve({
                ok: false,
                status: res.statusCode,
                error: parsed.error ? parsed.error.message : data,
              });
            }
          } catch (err) {
            resolve({ ok: false, status: res.statusCode, error: data });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    const LIMIT = 50 * 1024; // 50KB is plenty for a letter draft request
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMIT) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));

  // Prevent path traversal outside the public directory
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  // Basic CORS so the demo also works if the frontend is ever hosted
  // separately from this server.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    const requestId = randomUUID();
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || '{}');
      const { apiKey, letterType, patientInfo, bullets, recipient } = payload;

      if (!apiKey || typeof apiKey !== 'string') {
        sendJson(res, 400, { ok: false, error: 'Missing API key. Enter a Claude API key to use AI mode.' });
        return;
      }
      if (!bullets || typeof bullets !== 'string' || !bullets.trim()) {
        sendJson(res, 400, { ok: false, error: 'Please provide at least one clinical finding.' });
        return;
      }

      const systemPrompt = buildSystemPrompt(letterType);
      const userPrompt = buildUserPrompt({ letterType, patientInfo, bullets, recipient });

      const result = await callClaude({ apiKey, systemPrompt, userPrompt });

      if (!result.ok) {
        console.error(`[${requestId}] Claude API error:`, result.status, result.error);
        sendJson(res, result.status || 502, {
          ok: false,
          error: result.error || 'The AI service returned an error.',
        });
        return;
      }

      sendJson(res, 200, { ok: true, letter: result.text });
    } catch (err) {
      console.error(`[${requestId}] Server error:`, err.message);
      sendJson(res, 500, { ok: false, error: 'Unexpected server error.' });
    }
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`ScribeAssist running at http://localhost:${PORT}`);
});
