# Sincronização com Google Drive

## Visão Geral

A sincronização em nuvem do módulo **Relatório** permite manter atualizados os lançamentos financeiros entre diferentes terminais da rede de lotéricas sem a necessidade de um servidor de backend dedicado central. Toda a lógica de sincronização, versionamento e resolução de conflitos é executada diretamente pelo processo principal do Electron (`electron/drive-sync.cjs`).

---

## 1. Autenticação e Autorização (OAuth 2.0 com PKCE)

Para conectar o aplicativo a uma pasta do Google Drive, utiliza-se o protocolo OAuth 2.0 padrão para aplicações desktop:

1. **Geração de Desafio Criptográfico (PKCE):** O aplicativo cria um `code_verifier` aleatório de 64 caracteres e gera o seu correspondente hash SHA-256 codificado em Base64URL (`code_challenge`), prevenindo ataques de interceptação de autorização.
2. **Servidor Local Temporário:** Ao iniciar a autenticação (`report:sync-start-auth`), o Electron inicia um servidor HTTP temporário (`http://127.0.0.1`) em uma porta dinâmica e abre o navegador padrão do sistema através de `shell.openExternal`.
3. **Captura do Código de Autorização:** Após a aprovação do usuário na tela de consentimento do Google, a requisição de retorno é recebida pelo servidor local efêmero, que captura o parâmetro `code` e encerra a porta imediatamente.
4. **Troca e Renovação de Tokens:** O código de autorização e o `code_verifier` original são trocados pelos tokens `access_token` e `refresh_token`. Sempre que o token de acesso expira, o serviço solicita automaticamente sua renovação através do *endpoint* oficial de token do Google.

---

## 2. Proteção de Credenciais com DPAPI (`safeStorage`)

A integridade e o sigilo das credenciais de nuvem são resguardados através dos recursos nativos do sistema operacional:

- **Criptografia com DPAPI do Windows:** O segredo do cliente (*Client Secret*) e os tokens OAuth retornados não são persistidos em texto simples. Eles são cifrados utilizando a API `safeStorage` do Electron, vinculando a chave de decodificação à conta de usuário do Windows da máquina local.
- **Prefixo de Identificação:** As credenciais cifradas são marcadas internamente com o prefixo `safe:<base64>`. Caso a API `safeStorage` não esteja disponível, a gravação de segredos em texto puro é expressamente bloqueada por exceção em tempo de execução.
- **Compatibilidade Legada:** O decodificador reconhece arquivos de configurações locais anteriores e converte segredos legados para o formato seguro automaticamente ao inicializar.

---

## 3. Modelo de Sincronização por Snapshots Imutáveis

Em vez de gravar e sobrescrever diretamente um único banco de dados compartilhado (o que causaria corrupção ou perda de lançamentos simultâneos), o sistema adota um modelo baseado em **Snapshots Imutáveis**:

- **Arquivos Estruturados por Mês/Ano/Lotérica:** Os lançamentos de cada unidade são particionados por pasta remota (`DADOS CONTROLE PIX/<Loterica>/<Ano>`).
- **Nomenclatura com Hash de Versão:** Cada snapshot enviado para a nuvem recebe um identificador único com a seguinte estrutura:
  ```text
  <loterica>_<ano>_<mes>_v<numero>_<version_id>.json
  ```
- **Grafo Acíclico Dirigido (DAG):** O metadados de cada versão carregam o identificador da versão imediatamente anterior (`base_version_id`), além de `version_num`, `device_id`, `device_name` e `created_at`. Isso compõe um histórico distribuído no formato de Grafo Acíclico Dirigido (DAG).
- **Detecção de Ancestral Comum (`findMergeBase`):** Quando dois dispositivos enviam snapshots a partir da mesma versão base, o sistema executa um algoritmo de ordenação topológica para identificar a raiz comum e os nós divergentes.

---

## 4. Detecção e Resolução de Conflitos

Quando o serviço de sincronização identifica alterações remotas que não descendem linearmente da base local:

1. **Estado de Conflito Registrado:** A divergência é gravada na tabela local `sync_conflicts` e armazenada em cache no processo principal (`pendingRemoteUpdates`).
2. **Notificação ao Usuário:** Um evento IPC (`sync:remote-update`) é emitido para as janelas abertas do aplicativo, alertando o operador sobre a necessidade de decisão.
3. **Comparador Visual de Versões (*Diff*):** O usuário pode inspecionar uma pré-visualização linha a linha das diferenças através de `report:sync-get-version-diff`, que compara item por item entre o estado local e o arquivo remoto.
4. **Opções de Resolução:**
   - **Aceitar Versão Remota (`acceptRemote`):** Atualiza a base de dados local com as informações vindas do Google Drive.
   - **Manter Versão Local (`keepLocal`):** Registra uma justificativa operacional e gera um novo nó na árvore (nova versão incrementada), sobrepondo as alterações conflitantes com rastreabilidade auditável.

---

## 5. Fila em Segundo Plano e Tolerância a Falhas

- **Fila Persistente (`sync_queue`):** Lançamentos, edições ou exclusões feitas no Relatório são gravados primeiro no SQLite local e enfileirados na tabela `sync_queue`.
- **Intervalo Automático de Verificação:** Um temporizador periódico (configurável, por padrão a cada 5 segundos) consome a fila e verifica a existência de novos snapshots remotos.
- **Sincronização Manual:** O operador pode disparar a verificação imediata via botão na interface ou através do menu na bandeja do sistema (`Tray`).
- **Pausa Automática em Migrações:** Durante procedimentos de restauração ou migração de banco de dados legado, o serviço de sincronização é desativado para evitar sobrescrita ou envio de dados incompletos.
