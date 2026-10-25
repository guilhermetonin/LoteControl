# Sincronização com Google Drive

## Visão Geral

A sincronização em nuvem do módulo **Relatório** permite manter atualizados os lançamentos financeiros entre diferentes terminais da rede de lotéricas.

## Recursos de Sincronização

1. **Protocolo OAuth Seguro:**
   - Autenticação com serviços do Google utilizando fluxo OAuth com servidor local temporário para captura do código de autorização.
2. **Criptografia DPAPI (`safeStorage`):**
   - O segredo do cliente (*Client Secret*) e os tokens de acesso são armazenados de forma cifrada no disco através da API DPAPI nativa do Windows fornecida pelo Electron.
3. **Resolução de Conflitos e Controle de Versões:**
   - O banco `pix_lotericas.db` mantém tabelas de controle de versão (`sync_versions_history`, `sync_state`, `sync_conflicts`).
   - Sincronização sob demanda via botão ou automática em intervalos configurados.
