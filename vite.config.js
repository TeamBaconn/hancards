
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Plugin: auto-generate packs/index.json listing all .csv files in public/packs/
function packsIndexPlugin() {
  const packsDir = path.resolve(__dirname, 'public/packs');
  function generate() {
    if (!fs.existsSync(packsDir)) return;
    const csvFiles = fs.readdirSync(packsDir).filter(f => f.endsWith('.csv'));
    fs.writeFileSync(path.join(packsDir, 'index.json'), JSON.stringify(csvFiles, null, 2) + '\n');
  }
  return {
    name: 'packs-index',
    buildStart() { generate(); },
    configureServer(server) {
      generate();
      // Re-generate when csv files are added/removed in public/packs/
      server.watcher.on('all', (event, filePath) => {
        if (filePath.startsWith(packsDir) && filePath.endsWith('.csv')) generate();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), packsIndexPlugin()],
  base: '/hancards/',
})
