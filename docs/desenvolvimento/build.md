# Compilação e Empacotamento

## Scripts Disponíveis

- **`npm run build`**: Executa a compilação completa do projeto (`build:ui` e `build:electron`).
- **`npm run build:ui`**: Executa a checagem de tipos com TypeScript (`tsc -p tsconfig.json`) e o empacotamento da interface React via Vite.
- **`npm run build:electron`**: Compila o script de preload (`electron/preload.ts`) para `dist-electron/preload.cjs` usando `esbuild`.
- **`npm run icon`**: Converte `assets/icon-app.png` no arquivo de ícone multi-resolução nativo do Windows `assets/icon.ico`.
- **`npm run pack`**: Gera o diretório com a aplicação descompactada em `release/win-unpacked/`, ideal para testes de execução antes de gerar o instalador.
- **`npm run dist`**: Gera o instalador oficial do Windows (NSIS) de 64 bits na pasta `release/`.

## Nomenclatura e Versão do Instalador

O instalador gerado pelo `electron-builder` segue a versão declarada dinamicamente no campo `"version"` do arquivo [`package.json`](../../package.json):

```text
release/LoteControl Setup <versão>.exe
```

*(Exemplo: com a versão `1.2.1` configurada no `package.json`, o artefato gerado será `release/LoteControl Setup 1.2.1.exe`).*

### Configuração do Instalador (NSIS)

As propriedades de distribuição estão configuradas no bloco `"build"` do `package.json`:
- **Instalador personalizado:** Permite escolher o diretório de instalação (`oneClick: false`).
- **Atalhos:** Cria atalhos na Área de Trabalho e no Menu Iniciar automaticamente.
- **Recursos Descompactados:** O arquivo WebAssembly do SQLite (`sql-wasm.wasm`) é descompactado fora do arquivo `.asar` (`asarUnpack` e `extraResources`) para permitir carregamento nativo e performático pelo `sql.js`.
