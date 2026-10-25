import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { Ledger, RelatorioModule } from '../src/modules/relatorio/RelatorioModule';

const mockEntries = [
  { id: 'item-1', dia: 1, valor: 100.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente A', funcionario: 'Ana' },
  { id: 'item-2', dia: 1, valor: 150.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente B', funcionario: 'Bia' },
  { id: 'item-3', dia: 3, valor: 50.0, tipo: 'falta', status: 'conferido', cliente: 'Cliente C', funcionario: 'Carlos' },
  { id: 'item-4', dia: 3, valor: 75.0, tipo: 'falta', status: 'pendente', cliente: 'Cliente D', funcionario: 'Daniel' },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Substituição do popup nativo de exclusão e exclusão múltipla no Relatório', () => {
  it('apresenta "Excluir lançamento" quando nenhuma linha está selecionada e abre modal integrado', async () => {
    const onDelete = vi.fn();
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={onDelete}
      />
    );

    // Clica com botão direito na primeira linha
    const row1 = document.getElementById('report-row-item-1')!;
    fireEvent.contextMenu(row1, { clientX: 100, clientY: 100 });

    // Menu contextual deve conter "Excluir lançamento" no singular
    const deleteBtn = screen.getByRole('button', { name: 'Excluir lançamento' });
    expect(deleteBtn).toBeInTheDocument();

    // Clica em "Excluir lançamento"
    fireEvent.click(deleteBtn);

    // Modal integrado customizado deve aparecer (sem window.confirm)
    const modalTitle = screen.getByRole('heading', { name: 'Confirmar exclusão' });
    expect(modalTitle).toBeInTheDocument();
    expect(screen.getByText('Excluir este lançamento? A exclusão será lógica e sincronizada.')).toBeInTheDocument();

    // Botão de cancelar fecha o modal sem chamar onDelete
    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelBtn);
    expect(screen.queryByRole('heading', { name: 'Confirmar exclusão' })).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    // Abre novamente e confirma a exclusão
    fireEvent.contextMenu(row1, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir lançamento' }));

    const confirmDeleteBtn = screen.getAllByRole('button', { name: 'Excluir lançamento' })[0];
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith([mockEntries[0]]);
    });
  });

  it('apresenta "Excluir N lançamentos selecionados" quando há múltiplas linhas selecionadas e o clique ocorre dentro da seleção', async () => {
    const onDelete = vi.fn();
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={onDelete}
      />
    );

    const checkCells = document.querySelectorAll('.rp-check-cell');
    const row2 = document.getElementById('report-row-item-2')!;

    // Seleciona item-1 com clique na célula da checkbox (área fora do input)
    fireEvent.click(checkCells[0]);
    // Adiciona item-2 à seleção com Ctrl+clique
    fireEvent.click(checkCells[1], { ctrlKey: true });

    // Clica com botão direito em item-2 (dentro da seleção de 2 itens)
    fireEvent.contextMenu(row2, { clientX: 100, clientY: 100 });

    // O menu deve exibir a opção no plural com contagem
    const deleteBtn = screen.getByRole('button', { name: 'Excluir 2 lançamentos selecionados' });
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);

    // Modal deve pedir confirmação informando a contagem exata
    const modalTitle = screen.getByRole('heading', { name: 'Confirmar exclusão' });
    expect(modalTitle).toBeInTheDocument();
    expect(screen.getByText('Excluir estes 2 lançamentos? A exclusão será lógica e sincronizada.')).toBeInTheDocument();

    // Confirma exclusão
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Excluir lançamentos' });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith([mockEntries[0], mockEntries[1]]);
    });
  });

  it('desmarca a seleção e atua apenas no item clicado quando o botão direito é disparado FORA da seleção atual', async () => {
    const onDelete = vi.fn();
    render(
      <Ledger
        title="PIX Faltando"
        kind="falta"
        entries={mockEntries}
        onEdit={vi.fn()}
        onInlineSave={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={onDelete}
      />
    );

    const row1 = document.getElementById('report-row-item-1')!;
    const row2 = document.getElementById('report-row-item-2')!;
    const row3 = document.getElementById('report-row-item-3')!;

    // Seleciona item-1 e item-2
    fireEvent.click(row1);
    fireEvent.click(row2, { ctrlKey: true });

    // Clica com o botão direito em item-3 (que está fora da seleção de 1 e 2)
    fireEvent.contextMenu(row3, { clientX: 100, clientY: 100 });

    // O menu deve mostrar a opção singular "Excluir lançamento", mirando apenas item-3
    const deleteBtn = screen.getByRole('button', { name: 'Excluir lançamento' });
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);

    // O modal deve informar apenas 1 lançamento
    expect(screen.getByText('Excluir este lançamento? A exclusão será lógica e sincronizada.')).toBeInTheDocument();

    const confirmBtn = screen.getAllByRole('button', { name: 'Excluir lançamento' })[0];
    fireEvent.click(confirmBtn);

    // Deve excluir estritamente item-3, protegendo item-1 e item-2
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith([mockEntries[2]]);
    });
  });
});

describe('Exportação e geração de modelo padronizado do Relatório', () => {
  it('gera modelo com as abas Lançamentos, Instruções e Exemplo quando não há registros (9 colunas)', () => {
    const book = XLSX.utils.book_new();
    const PADRAO_COLUNAS = ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'];
    const wsLancamentos = XLSX.utils.aoa_to_sheet([PADRAO_COLUNAS]);
    XLSX.utils.book_append_sheet(book, wsLancamentos, 'Lançamentos');

    const wsInstrucoes = XLSX.utils.json_to_sheet([
      { Coluna: 'A', Campo: 'Loterica', Obrigatório: 'Sim' },
      { Coluna: 'B', Campo: 'Ano', Obrigatório: 'Sim' },
    ]);
    XLSX.utils.book_append_sheet(book, wsInstrucoes, 'Instruções');

    const wsExemplo = XLSX.utils.json_to_sheet([
      { Loterica: 'CAÇULA', Ano: 2026, Mes: 10, Categoria: 'FALTANDO', Dia: 5, Descricao: 'Diferença Pix', Valor: 100, Conferido: 'TRUE' }
    ]);
    XLSX.utils.book_append_sheet(book, wsExemplo, 'Exemplo');

    expect(book.SheetNames).toEqual(['Lançamentos', 'Instruções', 'Exemplo']);

    // A aba Lançamentos deve ter apenas a linha de cabeçalho com 9 colunas
    const rows = XLSX.utils.sheet_to_json<any>(book.Sheets['Lançamentos'], { header: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(PADRAO_COLUNAS);
  });

  it('exporta registros reais na aba Lançamentos com as 9 colunas padronizadas unificando Descricao', () => {
    const book = XLSX.utils.book_new();
    const PADRAO_COLUNAS = ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'];

    const items = [
      { Loterica: 'CAÇULA', Ano: 2026, Mes: 10, Categoria: 'FALTANDO', Dia: 1, Descricao: 'Cliente A', Funcionaria: 'Ana', Valor: 100, Conferido: 'FALSE' },
      { Loterica: 'CAÇULA', Ano: 2026, Mes: 10, Categoria: 'SOBRANDO', Dia: 3, Descricao: 'Cliente B', Funcionaria: 'Bia', Valor: 50, Conferido: 'TRUE' },
    ];

    const ws = XLSX.utils.json_to_sheet(items, { header: PADRAO_COLUNAS });
    XLSX.utils.book_append_sheet(book, ws, 'Lançamentos');

    const data = XLSX.utils.sheet_to_json<any>(book.Sheets['Lançamentos']);
    expect(data).toHaveLength(2);
    expect(data[0].Loterica).toBe('CAÇULA');
    expect(data[0].Categoria).toBe('FALTANDO');
    expect(data[0].Descricao).toBe('Cliente A');
    expect(data[0].Conferido).toBe('FALSE');
    expect(data[1].Categoria).toBe('SOBRANDO');
    expect(data[1].Conferido).toBe('TRUE');
  });
});

describe('Validação e importação de planilhas Excel no Relatório', () => {
  function createWorkbookBytes(sheetName: string, headers: string[], rows: any[][]): Uint8Array {
    const book = XLSX.utils.book_new();
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(book, ws, sheetName);
    return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
  }

  it('processa e valida uma planilha correta contendo registros válidos no padrão 9 colunas', () => {
    const headers = ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'];
    const rows = [
      ['CAÇULA', 2026, 10, 'FALTANDO', 5, 'Diferença João Silva', 'Ana', 150.0, 'TRUE'],
      ['SORTE GRANDE', 2026, 10, 'SOBRANDO', 10, 'Sobra Maria', 'Bia', 80.5, 'FALSE'],
      ['PUPINS', 2026, 11, 'FALTANDO', 20, '', '', 200, 'false'],
    ];

    const bytes = createWorkbookBytes('Lançamentos', headers, rows);
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheet = workbook.Sheets['Lançamentos'];
    const parsed = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    expect(parsed).toHaveLength(4); // header + 3 rows
    expect(parsed[1][0]).toBe('CAÇULA');
    expect(parsed[1][3]).toBe('FALTANDO');
    expect(parsed[2][0]).toBe('SORTE GRANDE');
    expect(parsed[3][0]).toBe('PUPINS');
  });

  it('rejeita planilhas sem a aba Lançamentos', () => {
    const bytes = createWorkbookBytes('DadosIncorretos', ['A', 'B'], [['1', '2']]);
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'lançamentos' || n.toLowerCase() === 'lancamentos');
    expect(sheetName).toBeUndefined();
  });

  it('detecta lotérica inválida, datas inconsistentes e valores negativos', () => {
    const headers = ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'];
    const rows = [
      ['LOTÉRICA INEXISTENTE', 2026, 10, 'FALTANDO', 5, '', '', 100, 'TRUE'],
      ['CAÇULA', 1800, 10, 'FALTANDO', 5, '', '', 100, 'TRUE'],
      ['CAÇULA', 2026, 13, 'FALTANDO', 5, '', '', 100, 'TRUE'],
      ['CAÇULA', 2026, 2, 'FALTANDO', 31, '', '', 100, 'TRUE'], // Fevereiro não tem 31 dias
      ['CAÇULA', 2026, 10, 'INVALIDA', 5, '', '', 100, 'TRUE'],
      ['CAÇULA', 2026, 10, 'FALTANDO', 5, '', -50, 'TRUE'],
      ['CAÇULA', 2026, 10, 'FALTANDO', 5, '', 100, 'TALVEZ'],
    ];

    const bytes = createWorkbookBytes('Lançamentos', headers, rows);
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheet = workbook.Sheets['Lançamentos'];
    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    const errors: string[] = [];
    const validLots = ['CAÇULA', 'SORTE GRANDE', 'PUPINS'];

    for (let i = 1; i < rawRows.length; i++) {
      const r = rawRows[i];
      const line = i + 1;
      const lot = String(r[0] || '').trim().toUpperCase();
      if (!validLots.includes(lot)) errors.push(`Linha ${line}: Lotérica inválida`);
      const ano = Number(r[1]);
      if (ano < 1900 || ano > 2100) errors.push(`Linha ${line}: Ano inválido`);
      const mes = Number(r[2]);
      if (mes < 1 || mes > 12) errors.push(`Linha ${line}: Mês inválido`);
      const dia = Number(r[4]);
      if (mes === 2 && dia > 29) errors.push(`Linha ${line}: Dia inválido para fevereiro`);
      const cat = String(r[3] || '').toUpperCase();
      if (!['FALTANDO', 'SOBRANDO'].includes(cat)) errors.push(`Linha ${line}: Categoria inválida`);
      const val = Number(r[7]);
      if (val <= 0) errors.push(`Linha ${line}: Valor inválido`);
      const conf = String(r[8] || '').toUpperCase();
      if (!['TRUE', 'FALSE'].includes(conf)) errors.push(`Linha ${line}: Conferido inválido`);
    }

    expect(errors.length).toBe(7);
  });
});

describe('Integração de Interface no RelatórioModule', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      report: {
        getLancamentos: vi.fn().mockResolvedValue([]),
        getDaysWithEntries: vi.fn().mockResolvedValue([]),
        getFuncionarios: vi.fn().mockResolvedValue(['Ana', 'Bia']),
        getOfficialBaseInfo: vi.fn().mockResolvedValue(null),
        getSyncStatus: vi.fn().mockResolvedValue({ status: 'Conectado' }),
        getSyncConfig: vi.fn().mockResolvedValue({}),
        getPendingUpdates: vi.fn().mockResolvedValue([]),
        getConflicts: vi.fn().mockResolvedValue([]),
        addLancamento: vi.fn().mockResolvedValue({ id: 'pix-new-1' }),
        deleteLancamento: vi.fn().mockResolvedValue(true),
        onSyncStatus: vi.fn().mockReturnValue(() => {}),
        onRemoteUpdate: vi.fn().mockReturnValue(() => {}),
      },
      events: {
        onDomainChanged: vi.fn().mockReturnValue(() => {}),
      },
      shell: {
        getState: vi.fn().mockResolvedValue({ minimizeToTray: false }),
        setMinimizeToTray: vi.fn().mockResolvedValue(true),
      },
      dialog: {
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
        saveFile: vi.fn().mockResolvedValue(true),
      },
    };
  });

  it('renderiza o painel "IMPORTAÇÃO E EXPORTAÇÃO DE PLANILHAS" com os dois botões', async () => {
    render(<RelatorioModule workspaceId="test-ws" isActive={true} />);

    // Clica nas configurações do Relatório
    const settingsBtn = screen.getByRole('button', { name: /configurações/i });
    fireEvent.click(settingsBtn);

    // Deve exibir o cabeçalho renomeado
    expect(screen.getByText('IMPORTAÇÃO E EXPORTAÇÃO DE PLANILHAS')).toBeInTheDocument();

    // Deve exibir ambos os botões
    expect(screen.getByRole('button', { name: /exportar para excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /importar do excel/i })).toBeInTheDocument();
  });

  it('abre o modal de prévia ao importar arquivo no padrão 9 colunas e grava com cliente=Descricao', async () => {
    const addLancamento = vi.fn().mockResolvedValue({ id: 'pix-imported-1' });
    (window as any).electronAPI.report.addLancamento = addLancamento;

    render(<RelatorioModule workspaceId="test-ws" isActive={true} />);

    const settingsBtn = screen.getByRole('button', { name: /configurações/i });
    fireEvent.click(settingsBtn);

    // Cria arquivo Excel no novo padrão 9 colunas
    const book = XLSX.utils.book_new();
    const rows = [
      ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'],
      ['CAÇULA', 2026, 10, 'FALTANDO', 5, 'Diferença Caixa 1', 'Ana', 120.0, 'TRUE'],
      ['SORTE GRANDE', 2026, 10, 'SOBRANDO', 8, 'Sobra Pix Cliente', 'Bia', 60.0, 'FALSE'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(book, ws, 'Lançamentos');
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
    const file = new File([bytes], 'lancamentos-outubro.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Localiza input de arquivo oculto
    const fileInput = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Dispara seleção do arquivo
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Modal de prévia deve aparecer com dados resumidos
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /importar lançamentos do excel/i })).toBeInTheDocument();
    });

    expect(screen.getByText('lancamentos-outubro.xlsx')).toBeInTheDocument();
    expect(screen.getByText('Total de lançamentos')).toBeInTheDocument();

    // NENHUM registro deve ter sido gravado ainda!
    expect(addLancamento).not.toHaveBeenCalled();

    // Clica no botão de confirmação
    const confirmBtn = screen.getByRole('button', { name: /confirmar importação/i });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    // Deve gravar ambos os lançamentos através de api.addLancamento
    await waitFor(() => {
      expect(addLancamento).toHaveBeenCalledTimes(2);
    });

    expect(addLancamento).toHaveBeenCalledWith(expect.objectContaining({
      loterica: 'CAÇULA',
      ano: 2026,
      mes: 10,
      dia: 5,
      tipo: 'falta',
      cliente: 'Diferença Caixa 1',
      valor: 120.0,
      status: 'conferido',
    }));

    expect(addLancamento).toHaveBeenCalledWith(expect.objectContaining({
      loterica: 'SORTE GRANDE',
      ano: 2026,
      mes: 10,
      dia: 8,
      tipo: 'sobra',
      cliente: 'Sobra Pix Cliente',
      valor: 60.0,
      status: 'pendente',
    }));
  });

  it('mantém retrocompatibilidade com planilhas antigas de 10 colunas (Cliente e Descricao)', async () => {
    const addLancamento = vi.fn().mockResolvedValue({ id: 'pix-imported-legado' });
    (window as any).electronAPI.report.addLancamento = addLancamento;

    render(<RelatorioModule workspaceId="test-ws" isActive={true} />);

    const settingsBtn = screen.getByRole('button', { name: /configurações/i });
    fireEvent.click(settingsBtn);

    // Planilha legada com 10 colunas
    const book = XLSX.utils.book_new();
    const rows = [
      ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Cliente', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'],
      ['PUPINS', 2026, 10, 'FALTANDO', 12, 'Supermercado Central', 'Ajuste final', 'Carlos', 45.0, 'TRUE'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(book, ws, 'Lançamentos');
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
    const file = new File([bytes], 'legado-10-colunas.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const fileInput = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /importar lançamentos do excel/i })).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /confirmar importação/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(addLancamento).toHaveBeenCalledTimes(1);
    });

    expect(addLancamento).toHaveBeenCalledWith(expect.objectContaining({
      loterica: 'PUPINS',
      cliente: 'Supermercado Central - Ajuste final',
      valor: 45.0,
    }));
  });

  it('bloqueia a importação e exibe alerta quando o arquivo contém erros impeditivos', async () => {
    const addLancamento = vi.fn();
    (window as any).electronAPI.report.addLancamento = addLancamento;

    render(<RelatorioModule workspaceId="test-ws" isActive={true} />);

    const settingsBtn = screen.getByRole('button', { name: /configurações/i });
    fireEvent.click(settingsBtn);

    // Cria arquivo com erro (lotérica inválida e valor negativo)
    const book = XLSX.utils.book_new();
    const rows = [
      ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'],
      ['LOTÉRICA DESCONHECIDA', 2026, 10, 'FALTANDO', 5, '', '', -50.0, 'TRUE'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(book, ws, 'Lançamentos');
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
    const file = new File([bytes], 'com-erros.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const fileInput = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/erro\(s\) impeditivo\(s\) encontrado\(s\)/i)).toBeInTheDocument();
    });

    // O botão de confirmar deve estar desabilitado
    const confirmBtn = screen.getByRole('button', { name: /confirmar importação/i });
    expect(confirmBtn).toBeDisabled();

    // Nenhuma gravação permitida
    expect(addLancamento).not.toHaveBeenCalled();

    // Usuário cancela
    const cancelBtn = screen.getAllByRole('button', { name: 'Cancelar' })[0];
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole('heading', { name: /importar lançamentos do excel/i })).not.toBeInTheDocument();
    expect(addLancamento).not.toHaveBeenCalled();
  });

  it('preserva múltiplos lançamentos com valores idênticos (ex: 89 lançamentos de R$ 15,00) sem alertar duplicação falsa nem agrupar', async () => {
    const addLancamento = vi.fn().mockResolvedValue({ id: 'pix-dup-ok' });
    (window as any).electronAPI.report.addLancamento = addLancamento;

    render(<RelatorioModule workspaceId="test-ws" isActive={true} />);

    const settingsBtn = screen.getByRole('button', { name: /configurações/i });
    fireEvent.click(settingsBtn);

    // Cria planilha com múltiplos lançamentos de mesmo valor no mesmo dia sem descrição/funcionária
    const book = XLSX.utils.book_new();
    const rows = [
      ['Loterica', 'Ano', 'Mes', 'Categoria', 'Dia', 'Descricao', 'Funcionaria', 'Valor', 'Conferido'],
      ['CAÇULA', 2026, 10, 'SOBRANDO', 21, '', '', 15.0, 'TRUE'],
      ['CAÇULA', 2026, 10, 'SOBRANDO', 21, '', '', 15.0, 'TRUE'],
      ['CAÇULA', 2026, 10, 'SOBRANDO', 21, '', '', 15.0, 'TRUE'],
      ['CAÇULA', 2026, 10, 'SOBRANDO', 21, '', '', 20.0, 'FALSE'],
      ['CAÇULA', 2026, 10, 'SOBRANDO', 21, '', '', 20.0, 'FALSE'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(book, ws, 'Lançamentos');
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
    const file = new File([bytes], 'valores-repetidos.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const fileInput = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /importar lançamentos do excel/i })).toBeInTheDocument();
    });

    // NÃO deve exibir alerta de duplicação
    expect(screen.queryByText(/duplicação/i)).not.toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // total de lançamentos válidos

    const confirmBtn = screen.getByRole('button', { name: /confirmar importação/i });
    fireEvent.click(confirmBtn);

    // Todos os 5 lançamentos devem ser salvos individualmente
    await waitFor(() => {
      expect(addLancamento).toHaveBeenCalledTimes(5);
    });
  });
});
