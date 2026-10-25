# Arquitetura do LoteControl

## Visão Geral

O LoteControl é estruturado como uma aplicação desktop única baseada em Electron, React e TypeScript, integrando os módulos **Protege**, **Pix** e **Relatório** em um ambiente consolidado:

```text
Electron Main (Processo Principal)
  ├─ Instância SQLite Pix ─ IPC db:*
  ├─ Instância SQLite Relatório ─ IPC report:/sync:*
  ├─ Instância SQLite Protege ─ IPC protege:*
  ├─ GoogleDriveSync global (Sincronização em nuvem do Relatório)
  ├─ Gerenciamento de Bandeja (Tray) e Configurações Globais
  └─ Assistente de Migração e Integridade SQLite
                              │
                    Preload com Isolamento (preload.cjs)
                              │
Renderer (React 19 / TypeScript / Tailwind CSS via Vite)
  ├─ Shell Principal / Gerenciador de Abas Dinâmico
  ├─ Módulo Protege (Conciliação de depósitos de cofres inteligentes)
  ├─ Módulo Pix (Conferência ágil de extratos bancários da CEF)
  └─ Módulo Relatório (Livro caixa consolidado e conciliação financeira)
```

## Diretrizes de Arquitetura

1. **Processo Principal Único:** Todas as conexões aos bancos de dados SQLite e o serviço de sincronização do Google Drive são instanciados exclusivamente no processo principal (`electron/main.cjs`). Múltiplas abas abertas não duplicam instâncias de banco de dados ou processos de sincronização.
2. **Segurança e Isolamento:**
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `sandbox: true`
   - A interface não tem acesso arbitrário a APIs do Node.js ou ao sistema de arquivos. Toda a comunicação ocorre por canais IPC tipados expostos no script de pré-carregamento (`preload.cjs`).
3. **Criptografia de Credenciais:** As credenciais e tokens do Google Drive utilizam criptografia nativa do Windows via `safeStorage` (DPAPI).
4. **Persistência Local-First:** Os bancos de dados operam com arquivos SQLite locais gerenciados via WebAssembly (`sql.js`), garantindo leitura e gravação atômica sem dependências compiladas em C++.
