# Backups e Recuperação

## Cópias de Segurança Automáticas

O sistema realiza cópias de segurança automáticas em pontos críticos do fluxo operacional:

1. **Antes de Migrações de Base:** O assistente de migração gera cópias rotuladas com carimbo de data/hora e hash de integridade.
2. **Exportação de Dados:** Os módulos Pix e Protege oferecem mecanismos de exportação de dados estruturados em JSON e planilhas Excel.
3. **Persistência Atômica:** Todos os bancos em memória operados com `sql.js` são persistidos em disco com salvamento atômico, assegurando que o arquivo anterior permaneça íntegro caso haja interrupção no processo de gravação.
