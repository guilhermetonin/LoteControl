# Armazenamento e Persistência de Dados

## Localização dos Dados

Os dados operacionais de produção são mantidos exclusivamente no diretório de dados do usuário do sistema operacional, acessível através de `app.getPath('userData')`:

`%APPDATA%\LoteControl\database`

## Bancos SQLite Utilizados

A persistência do LoteControl adota o modelo *local-first*, utilizando o motor SQLite compilado para WebAssembly (`sql.js`). Três bancos de dados locais atendem às necessidades específicas de cada módulo:

1. **`conferencia_pix.db`**: Armazena extratos bancários importados, regras de transações, conferências e histórico de sessões do módulo Pix.
2. **`protege.db`**: Armazena movimentações consolidadas, histórico de importações de cofres inteligentes e metadados operacionais do módulo Protege.
3. **`pix_lotericas.db`**: Armazena os lançamentos do livro-caixa, configurações de sincronização, fila persistente (`sync_queue`), histórico de versões (`sync_versions_history`) e conflitos (`sync_conflicts`) do módulo Relatório.

## Características de Gravação e Integridade

- **Atomicidade com Arquivos Temporários:** Todas as operações de persistência estruturada (tanto nos bancos SQLite quanto em arquivos de configuração JSON como `settings.json` e `protege_state.json`) utilizam escrita intermediária em arquivo temporário único (`.tmp-<pid>-<timestamp>`) seguida de substituição atômica (`renameSync`). Isso elimina o risco de corrupção de arquivos por desligamento imprevisto ou interrupções abruptas de processo.
- **Isolamento de Produção:** O diretório de instalação do programa permanece somente-leitura após instalado. Atualizações de versão do executável não interferem nos registros contidos em `%APPDATA%`.
- **Compatibilidade Multi-Janela:** O processo principal (`electron/main.cjs`) atua como orquestrador central e proprietário exclusivo das conexões aos bancos de dados, evitando conflitos de concorrência ou bloqueios entre múltiplas janelas da aplicação.
