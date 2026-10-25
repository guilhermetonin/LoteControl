# Armazenamento e Persistência de Dados

## Localização dos Dados

Os dados operacionais de produção são mantidos exclusivamente no diretório de dados do usuário do sistema operacional, acessível através de `app.getPath('userData')`:

`%APPDATA%\LoteControl\database`

## Bancos SQLite Utilizados

1. **`conferencia_pix.db`**: Armazena extratos importados, transações, marcações de conferência e configurações do módulo Pix.
2. **`protege.db`**: Armazena movimentações e histórico de importações do módulo Protege.
3. **`pix_lotericas.db`**: Armazena os lançamentos do livro-caixa diário e as filas de sincronização do módulo Relatório.

## Características de Gravação

- **Atomicidade:** Gravações de dados estruturados e configurações utilizam arquivos temporários intermediários e substituição atômica (`renameSync`) para prevenir corrupção em caso de queda de energia ou fechamento inesperado.
- **Isolamento de Produção:** O diretório de instalação do programa permanece somente-leitura após instalado, impedindo que atualizações do executável afetem os dados do operador.
