# Ambiente de Desenvolvimento

## Pré-requisitos

- **Sistema Operacional:** Windows 10 ou Windows 11 (64-bit)
- **Node.js:** Versão 22 LTS ou superior
- **Gerenciador de Pacotes:** npm (incluído no Node.js)

## Configuração Inicial

1. Clone o repositório ou acesse o diretório do projeto:
   ```powershell
   git clone https://github.com/guilhermetonin/LoteControl.git
   cd LoteControl
   ```
2. Instale as dependências com lockfile estrito:
   ```powershell
   npm ci
   ```
3. Inicie o ambiente de desenvolvimento (executa o servidor Vite e o Electron em paralelo):
   ```powershell
   npm run dev
   ```

## Variáveis e Modos de Teste

Para testes manuais isolados sem afetar os dados reais de produção em `%APPDATA%\LoteControl`, o processo principal suporta redirecionamento via variáveis de ambiente:

- `LOTE_CONTROL_TEST_USER_DATA`: Define um diretório temporário para isolar o `userData`.
- `LOTE_CONTROL_DISABLE_DRIVE_SYNC=1`: Desativa a inicialização da sincronização em segundo plano com o Google Drive.
