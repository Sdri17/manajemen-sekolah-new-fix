import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse incoming request body
  // Set limit to 50mb to safely handle full database backup pushes (students, grades, attendance, etc.)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API to update firebase-applet-config.json permanently on disk
  app.post("/api/update-firebase-config", (req, res) => {
    try {
      const newConfig = req.body;
      if (!newConfig || !newConfig.projectId || !newConfig.apiKey) {
        return res.status(400).json({ status: "error", message: "Project ID dan API Key wajib diisi" });
      }

      const formattedConfig = JSON.stringify(newConfig, null, 2);
      const rootConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
      const publicConfigPath = path.join(process.cwd(), 'public', 'firebase-applet-config.json');

      fs.writeFileSync(rootConfigPath, formattedConfig, 'utf8');
      
      try {
        fs.writeFileSync(publicConfigPath, formattedConfig, 'utf8');
      } catch (_e) {
        // Public folder writing fallback
      }

      console.log(`[FirebaseConfig] Successfully updated firebase-applet-config.json on disk to project: ${newConfig.projectId}`);
      return res.json({ status: "ok", message: "Berhasil memperbarui firebase-applet-config.json di file project!" });
    } catch (err: any) {
      console.error("[FirebaseConfig] Failed to update config on disk:", err);
      return res.status(500).json({ status: "error", message: `Gagal memperbarui file config: ${err.message}` });
    }
  });

  // Vite middleware for development or serving built assets for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[Vite] Vite development middleware loaded.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("[Production] Static files are served from dist/.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
