 <div align="center">

# LoteControl

### Sistema integrado de gestão financeira, conferência Pix e conciliação de cofres para redes lotéricas.

Centralize rotinas operacionais, automatize a conferência de extratos bancários e controle fechamentos de caixa em uma única aplicação desktop.


<div align="center">
  <a href="https://github.com/guilhermetonin/LoteControl/releases">
    <img src="https://img.shields.io/github/v/release/guilhermetonin/LoteControl?logo=github&label=release&style=flat-square" alt="Latest Release">
  </a>
  <img src="https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=FFD62E" alt="Vite">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite">
</div>


<img src="docs/images/dashboard.png" width="1000" alt="Visão geral do LoteControl com módulos de gestão e fechamento">

</div>

O **LoteControl** foi desenvolvido para solucionar a fragmentação das rotinas operacionais em casas lotéricas. Em vez de alternar entre diferentes planilhas e utilitários isolados para conferir depósitos de cofres inteligentes, validar transações Pix e consolidar o fechamento de caixa diário, o sistema reúne esses fluxos em uma única interface desktop.

Construído com arquitetura *local-first*, o aplicativo processa registros localmente em bancos de dados SQLite. Algumas funcionalidades, como a sincronização com o Google Drive, dependem de conexão com a internet.

---

## Módulos Principais

### Protege

Gerenciamento e conciliação de depósitos e sangrias recolhidos por cofres inteligentes.

- Suporte configurado para as unidades lotéricas da rede (**Caçula**, **Sorte Grande** e **Pupins**).
- Importação de relatórios operacionais com identificação de registros novos e duplicados.
- Armazenamento em banco SQLite local (`protege.db`).
- Suporte à exportação de dados para Excel e JSON.
- Saiba mais no guia do [Módulo Protege](docs/funcionalidades/protege.md).

### Pix

Conferência de transações Pix com extratos bancários da Caixa Econômica Federal.

- Importação de planilhas `.xlsx`, `.xls` e extratos `.csv`.
- Interface com virtualização de linhas e atalhos de teclado para marcação contínua.
- Painel de pendências com transferência de lançamentos para o Relatório diário.
- Totalizadores de seleção, incluindo soma, contagem e média.
- Saiba mais no guia do [Módulo Pix](docs/funcionalidades/pix.md).

### Relatório

Consolidação do livro-caixa diário e conciliação financeira das operações de balcão.

- Registro de movimentações por unidade lotérica, data e operador.
- Filtros por dia do mês e operador de caixa.
- Sincronização com Google Drive, com proteção de credenciais e tokens por meio dos recursos de segurança do Windows.
- Fila de sincronização em segundo plano com controle de versões e auditoria de alterações.
- Saiba mais no guia do [Módulo Relatório](docs/funcionalidades/relatorio.md).

---

## Download e Instalação

O LoteControl é distribuído por meio de um instalador para Windows.

### Passo a passo

1. Acesse a página de [Releases](https://github.com/guilhermetonin/LoteControl/releases/latest).
2. Baixe o instalador do LoteControl disponível na versão mais recente.
3. Execute o instalador e siga as instruções apresentadas na tela.
4. Ao concluir, abra o LoteControl pelo atalho criado na Área de Trabalho ou pelo Menu Iniciar.

**Requisito de sistema:** Windows 10 ou Windows 11 de 64 bits.

---

## Documentação Técnica

Para compreender a arquitetura, as funcionalidades e os procedimentos de desenvolvimento, consulte a documentação organizada na pasta [`docs/`](docs/).

- [Visão Geral da Documentação](docs/README.md)
- [Arquitetura do Sistema](docs/arquitetura/arquitetura.md)
- **Funcionalidades:** [Protege](docs/funcionalidades/protege.md) · [Pix](docs/funcionalidades/pix.md) · [Relatório](docs/funcionalidades/relatorio.md)
- **Desenvolvimento:** [Ambiente](docs/desenvolvimento/ambiente.md) · [Build](docs/desenvolvimento/build.md) · [Testes](docs/desenvolvimento/testes.md)
- **Dados:** [Armazenamento](docs/dados/armazenamento.md) · [Migração](docs/dados/migracao.md) · [Backups](docs/dados/backups.md) · [Google Drive](docs/dados/google-drive.md)

---

## Motivação

O LoteControl nasceu de uma necessidade prática: facilitar minhas próprias rotinas de trabalho. A ideia foi reunir ferramentas e processos que antes ficavam separados, tornando tarefas operacionais e conferências financeiras mais organizadas em uma única aplicação.

Embora tenha sido criado inicialmente para uso próprio, o código está publicado para que outras pessoas possam conhecer a implementação, estudar sua estrutura e adaptá-lo a outras necessidades ou propor melhorias.