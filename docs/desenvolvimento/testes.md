# Testes Automatizados

## Suíte de Testes

O projeto conta com suíte de testes unitários e testes de integração utilizando o **Vitest**.

### Executar Testes Unitários e de Componentes

```powershell
npm test
```

### Executar Teste de Fumaça (Smoke Test)

O teste de fumaça inicializa o processo Electron em ambiente isolado (diretório `userData` temporário), verificando a inicialização de serviços, criação de janelas e bancos SQLite:

```powershell
npm run test:smoke
```
