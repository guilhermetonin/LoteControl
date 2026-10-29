# Testes Automatizados

## Suíte de Testes

O LoteControl adota uma estratégia de testes automatizados utilizando o **Vitest** integrado ao **Testing Library** e **jsdom**, cobrindo regras de negócio, renderização de componentes e fluxos de integração.

---

### 1. Testes Unitários e de Componentes

Executa os testes das regras de conciliação bancária, parsers de arquivos, virtualização de componentes e hooks customizados:

```powershell
npm test
```

Principais suítes testadas:
- **Regras de Negócio e Parsers:**
  - `statementParser.test.ts`: Normalização e leitura de extratos bancários da Caixa Econômica Federal.
  - `parser.test.js` e `store.test.js`: Deduplicação e processamento de fechamentos do cofre Protege.
  - `rules.test.ts` e `undoRedo.test.ts`: Regras de conferência Pix e pilha de desfazer/refazer.
- **Componentes e Virtualização:**
  - `useVirtualList.test.ts` e `relatorio-virtual-table.test.tsx`: Desempenho e estabilidade na renderização de milhares de linhas simultâneas.
  - `useTableSelection.test.ts`: Controle ágil de seleção contínua via teclado (`Ctrl`, `Shift`, `Espaço`).

---

### 2. Testes de Integração e Ciclo de Vida

Testam a integridade dos serviços do processo principal e comunicação intermódulos:
- `tests/drive-sync-lifecycle.test.ts`: Ciclo de vida completo do serviço de sincronização com o Google Drive, renovação de tokens e decodificação segura.
- `tests/database-migration.test.ts`: Validação de integridade atômica e substituição segura de bases de dados legadas.
- `tests/pix-transfer.test.ts` e `tests/report-transfer-db.test.ts`: Transferência transacional de pendências Pix para os lançamentos do módulo Relatório.
- `tests/benchmark-ledger-render.test.tsx` e `tests/benchmark-selection.test.ts`: Benchmarks de tempo de resposta e consumo de memória da tabela do livro-caixa.

---

### 3. Teste de Fumaça do Electron (Smoke Test)

O teste de fumaça inicializa o processo Electron em ambiente isolado (diretório `userData` temporário), verificando a inicialização de serviços, criação de janelas, carregamento de bancos SQLite e integridade do IPC:

```powershell
npm run test:smoke
```

*Nota: Esse teste executa o script `scripts/smoke.cjs` e a rotina `runSmokeFlow()` em `electron/main.cjs`, simulando o ciclo de vida real da aplicação desktop sem abrir janelas visíveis.*
