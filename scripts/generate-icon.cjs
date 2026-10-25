const pngToIco = require('png-to-ico').default || require('png-to-ico');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'assets', 'icon-app.png');
const dest = path.join(root, 'assets', 'icon.ico');

async function generate() {
  if (!fs.existsSync(src)) {
    console.warn('[icon] icon-app.png não encontrado em assets/');
    return;
  }
  const buf = await pngToIco(src);
  fs.writeFileSync(dest, buf);
  console.log(`[icon] assets/icon.ico gerado com sucesso (${buf.length} bytes).`);
}

generate().catch((err) => {
  console.error('[icon] Erro ao gerar icon.ico:', err);
  process.exit(1);
});
