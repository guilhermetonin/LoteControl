# Arquitetura do LoteControl

## Visão Geral

O LoteControl é estruturado como uma aplicação desktop única baseada em **Electron**, **React 19** e **TypeScript**, integrando os módulos **Protege**, **Pix** e **Relatório** em um ambiente consolidado:

```text
Electron Main (Processo Principal)
  ├─ Instância SQLite Pix ─ IPC db:*
  ├─ Instância SQLite Relatório ─ IPC report:* / sync:*
  ├─ Instância SQLite Protege ─ IPC protege:*
  ├─ GoogleDriveSync (Sincronização em nuvem, OAuth PKCE, DAG e DPAPI)
  ├─ Gerenciamento de Bandeja (Tray) e Configurações Globais
  └─ Assistente de Migração e Integridade SQLite
                              │
                    Preload com Isolamento (preload.cjs)
                              │
Renderer (React 19 / TypeScript / Tailwind CSS via Vite)
  ├─ Shell Principal / Gerenciador de Janelas e Abas Dinâmico
  ├─ Módulo Protege (Conciliação de depósitos de cofres inteligentes)
  ├─ Módulo Pix (Conferência ágil de extratos bancários da CEF)
  └─ Módulo Relatório (Livro-caixa consolidado e conciliação financeira)
```

---

## Diretrizes de Engenharia e Isolamento

1. **Processo Principal Centralizado:** Todas as conexões aos bancos de dados SQLite e o serviço de sincronização com o Google Drive são instanciados exclusivamente no processo principal (`electron/main.cjs`). Janelas adicionais da aplicação comunicam-se com os mesmos serviços em memória compartilhados, evitando concorrência de escrita no disco.
2. **Segurança e Isolamento Estrito:**
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `sandbox: true`
   - A camada de interface gráfica (Renderer) não tem acesso arbitrário a módulos internos do Node.js ou chamadas diretas de sistema operacional. Toda a comunicação ocorre estritamente por canais IPC tipados expostos na interface `window.electronAPI` através do script de pré-carregamento (`electron/preload.ts`).
3. **Barramento de Eventos Multi-Janela:** O processo principal distribui eventos em tempo real (`domain:changed`, `sync:status-changed`, `sync:remote-update`) para todas as janelas ativas, garantindo consistência imediata de interface quando uma ação é executada em outra janela.
4. **Criptografia de Credenciais:** As credenciais e tokens do Google Drive utilizam criptografia nativa do Windows via `safeStorage` (DPAPI), impedindo o armazenamento de segredos em texto claro.
5. **Persistência Local-First:** Os bancos de dados operam com arquivos SQLite locais gerenciados via WebAssembly (`sql.js`), garantindo leitura e gravação atômica sem necessidade de compilação C++ nativa (*node-gyp*).
