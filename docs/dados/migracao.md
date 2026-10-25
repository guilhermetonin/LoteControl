# Migração de Dados

## Assistente de Migração

O LoteControl oferece um assistente integrado para migrar bases de dados operacionais originadas de versões anteriores ou sistemas legados dos módulos Pix e Relatório.

## Regras de Integridade

1. **Destino Vazio:** Para evitar sobreposição ou perda acidental de registros, a migração exige que a base de destino esteja limpa.
2. **Cópia de Segurança Obrigatória:** Antes de qualquer substituição de arquivo, o assistente gera um backup do banco original em:
   `%APPDATA%\LoteControl\migrations\backups\`
3. **Verificação por Hash SHA-256:** Cada cópia de segurança tem sua integridade calculada e conferida antes e após a gravação.
4. **Pausa Automática da Sincronização:** Durante a migração de bases do Relatório, o serviço de sincronização do Google Drive é pausado automaticamente para evitar propagação de estados intermediários.
