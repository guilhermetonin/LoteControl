# Documentação Técnica do LoteControl

Bem-vindo ao índice da documentação técnica do **LoteControl**. Aqui você encontra as diretrizes de arquitetura, guias operacionais dos módulos, documentação dos fluxos de dados e instruções para desenvolvimento e homologação.

---

## Estrutura da Documentação

### 1. Arquitetura e Engenharia
- **[Arquitetura do Sistema](arquitetura/arquitetura.md)**: Visão geral da arquitetura desktop, modelo de processos do Electron (Main x Renderer), canais IPC tipados no Preload, políticas de isolamento de processos (*sandbox* e *context isolation*) e barramento de eventos multi-janela.

### 2. Módulos e Funcionalidades
- **[Módulo Protege](funcionalidades/protege.md)**: Conciliação de sangrias e depósitos em cofres inteligentes, leitura de arquivos operacionais (`.xlsx`, `.xls`, `.csv`, `.json`), deduplicação de registros e persistência local.
- **[Módulo Pix](funcionalidades/pix.md)**: Conferência de extratos bancários da Caixa Econômica Federal, virtualização de lista para alto volume de dados, painel de pendências e transferência direta para o livro-caixa.
- **[Módulo Relatório](funcionalidades/relatorio.md)**: Livro-caixa consolidado das unidades lotéricas, filtros diários, conciliação e rastreabilidade financeira.

### 3. Dados e Sincronização
- **[Armazenamento e Persistência](dados/armazenamento.md)**: Estrutura dos bancos SQLite locais operados via WebAssembly (`sql.js`), integridade atômica com arquivos temporários e localização dos arquivos em `%APPDATA%`.
- **[Backups e Recuperação](dados/backups.md)**: Cópias de segurança pré-migração com hash SHA-256, mecanismos de exportação e rotina forense de resgate de dados em arquivos de storage legado.
- **[Sincronização com Google Drive](dados/google-drive.md)**: Integração em nuvem para o Relatório, fluxo OAuth 2.0 com PKCE, armazenamento criptografado de credenciais via DPAPI (`safeStorage`), versionamento por snapshots imutáveis em Grafo Acíclico Dirigido (DAG) e resolução de divergências.
- **[Migração de Dados Legados](dados/migracao.md)**: Regras de integridade para migração de bases legadas dos módulos Pix e Relatório, com validação de base limpa e pausa automática de serviços.

### 4. Guia de Desenvolvimento
- **[Ambiente de Desenvolvimento](desenvolvimento/ambiente.md)**: Pré-requisitos de sistema (Node.js 22 LTS, npm, Windows x64) e passos para clonar e iniciar o projeto.
- **[Compilação e Empacotamento](desenvolvimento/build.md)**: Scripts de build (Vite, esbuild), compilação do processo principal e empacotamento do instalador Windows via electron-builder (NSIS).
- **[Testes Automatizados](desenvolvimento/testes.md)**: Execução de testes unitários e de integração com Vitest/Testing Library, testes de ciclo de vida e teste de fumaça (*smoke test*) no Electron.

---

## Galeria de Interfaces

Os módulos do sistema e o painel integrado contam com referências visuais documentadas:
- [Visão Geral do Dashboard](images/dashboard.png)
- [Interface do Módulo Pix](images/pix.png)
- [Interface do Módulo Protege](images/protege.png)
- [Interface do Módulo Relatório](images/relatorio.png)
