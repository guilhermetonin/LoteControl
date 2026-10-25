# Compilação e Empacotamento

## Scripts Disponíveis

- **`npm run build`**: Compila a interface React via Vite e o processo principal do Electron via esbuild.
- **`npm run build:ui`**: Compila os componentes React, TypeScript e estilos Tailwind CSS.
- **`npm run build:electron`**: Compila os arquivos `electron/main.cjs` e `electron/preload.ts` para a pasta `dist-electron/`.
- **`npm run icon`**: Gera automaticamente o ícone `assets/icon.ico` com múltiplas resoluções a partir de `assets/icon-app.png`.
- **`npm run pack`**: Empacota o executável descompactado na pasta `release/win-unpacked/` para testes diretos.
- **`npm run dist`**: Gera o instalador oficial Windows NSIS (`release/LoteControl Setup 1.0.0.exe`).
