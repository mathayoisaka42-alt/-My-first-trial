import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase } from './server/db.ts';
import { resolveSafeStoragePath } from './server/storage.ts';
import { verifySessionToken } from './server/auth.ts';
import publicRoutes from './server/routes/publicRoutes.ts';
import academicRoutes from './server/routes/academicRoutes.ts';
import venueAndAdminRoutes from './server/routes/venueAndAdminRoutes.ts';

process.env.TZ = 'Africa/Dar_es_Salaam';

async function startServer() {
  initializeDatabase();

  const app = express();
  app.set('trust proxy', 1);

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'MUSTISO',
      timezone: 'Africa/Dar_es_Salaam',
      timestamp: new Date().toISOString(),
    });
  });

  // Confined storage file delivery (venues & avatars visible for portal UI, academic materials require auth)
  app.get('/api/files/:category/:filename', (req, res) => {
    const category = String(req.params.category);
    const filename = String(req.params.filename);
    const resolved = resolveSafeStoragePath(category, filename);
    if (!resolved || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    if (!['venues', 'avatars'].includes(category)) {
      const token =
        req.headers.authorization?.replace('Bearer ', '') ||
        (typeof req.query.token === 'string' ? req.query.token : '');
      if (!token || !verifySessionToken(token)) {
        res.status(401).json({ error: 'Authentication required to access academic files.' });
        return;
      }
    }

    res.sendFile(resolved);
  });

  // API Routers
  app.use('/api', publicRoutes);
  app.use('/api', academicRoutes);
  app.use('/api', venueAndAdminRoutes);

  // Explicit 404 for unknown /api routes
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MUSTISO server running at http://0.0.0.0:${PORT} (TZ=${process.env.TZ})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MUSTISO server:', err);
  process.exit(1);
});
