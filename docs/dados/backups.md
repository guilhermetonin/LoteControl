# Backups e Recuperação de Dados

## Cópias de Segurança Automáticas

O LoteControl adota políticas preventivas de salvaguarda de dados antes de intervenções estruturais:

1. **Backups Pré-Migração:** Antes de substituir ou importar qualquer base de dados legada para o Pix ou Relatório, o assistente de migração gera automaticamente uma cópia completa no diretório:
   ```text
   %APPDATA%\LoteControl\migrations\backups\
   ```
   Cada arquivo de backup é rotulado com o carimbo de data/hora (`YYYYMMDD-HHMMSS`) e o módulo correspondente.
2. **Validação de Integridade Criptográfica (SHA-256):** Toda operação de backup e migração calcula o hash SHA-256 do arquivo original e do arquivo de destino, abortando o processo caso haja qualquer divergência de bytes.
3. **Persistência Atômica Contínua:** Como os bancos em memória operados com `sql.js` são exportados para disco periodicamente por substituição atômica (`.tmp` -> renomeação atômica), o arquivo anterior no disco permanece íntegro e legível mesmo que ocorra uma interrupção durante a exportação.

---

## Recuperação Forense de Dados Legados (Protege)

O processo principal do Electron (`electron/main.cjs`) possui uma rotina especializada para recuperar dados legados do módulo Protege em casos de migração ou falha no armazenamento local:

- **Varredura Direta no LevelDB:** Caso o arquivo de estado `protege_state.json` ou o banco `protege.db` estejam ausentes ou vazios, o sistema realiza uma varredura direta nos arquivos `.ldb` e `.log` do armazenamento nativo do Chromium (`Local Storage/leveldb`).
- **Descompressor Snappy Integrado:** Para interpretar blocos compactados de registros nos arquivos de baixo nível do LevelDB, o aplicativo conta com uma implementação nativa do algoritmo Snappy (`snappyDecompress`), extraindo registros históricos (`records` e `historicoImportacoes`) e restaurando a base de dados do usuário de forma transparente.

---

## Exportação e Cópias Manuais

- **Módulo Pix:** Exportação da conferência em planilhas Excel estruturadas e backup completo das conferências e configurações em JSON.
- **Módulo Protege:** Exportação de movimentações e fechamentos de cofres em formatos Excel e JSON.
