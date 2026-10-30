import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  HardDrive,
  Cloud,
  FileText,
  Calendar,
  User,
  DollarSign,
  Tag,
  MessageSquare
} from 'lucide-react';

export interface ConflictItem {
  id: string;
  entry_id?: string;
  source?: 'conflict' | 'pending_update';
  fileKey?: string;
  loterica?: string;
  ano?: number;
  mes?: number;
  summary?: string;
  local_data: Record<string, any>;
  remote_data: Record<string, any>;
  created_at?: string;
}

export interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflicts: ConflictItem[];
  onResolve: (conflict: ConflictItem | any, choice: 'local' | 'remote') => Promise<void> | void;
  onSnooze: (seconds: number) => void;
}

export function formatCurrency(val: any): string {
  if (val === '-' || val === '' || val === null || val === undefined) return String(val || '-');
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function normalizeVal(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Formata data no padrão brasileiro DD/MM/YYYY sem sofrer alterações por fuso horário.
 * Lida com 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss...', dia/mes/ano numéricos ou 'DD/MM/YYYY'.
 * Exemplo: '2026-10-29' -> '29/10/2026'
 */
export function formatConflictDate(val: any, record?: Record<string, any>): string {
  if (record && record.dia && record.mes && record.ano) {
    return `${String(record.dia).padStart(2, '0')}/${String(record.mes).padStart(2, '0')}/${record.ano}`;
  }

  if (val === null || val === undefined || val === '' || val === '-') return '-';
  const str = String(val).trim();

  // Caso já esteja no padrão brasileiro DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  // Padrão ISO YYYY-MM-DD (com ou sem sufixo de hora)
  // Parsing direto por regex para garantir que NENHUM fuso horário subtraia 1 dia
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}/${m}/${y}`;
  }

  // Padrão DD-MM-YYYY
  const brHyphenMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (brHyphenMatch) {
    const [, d, m, y] = brHyphenMatch;
    return `${d}/${m}/${y}`;
  }

  // Fallback caso seja timestamp numérico válido
  const num = Number(str);
  if (!isNaN(num) && str.length > 8) {
    const date = new Date(num);
    if (!isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }

  return str;
}

/**
 * Formata datas ISO ou numéricas no padrão solicitado: HH:MM DD/MM/YYYY (horário local do computador)
 * Exemplo: 08:47 30/10/2026
 */
export function formatConflictDateTime(val: any): string {
  if (val === null || val === undefined || val === '' || val === '-') return '-';
  const num = Number(val);
  const date = !isNaN(num) && String(val).trim().length > 8 ? new Date(num) : new Date(val);
  if (isNaN(date.getTime())) return String(val);

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${hours}:${minutes} ${day}/${month}/${year}`;
}

/**
 * Renderiza badges coloridas de Operação / Tipo:
 * - 'falta' -> 'Faltando' com destaque em vermelho/alerta
 * - 'sobra' -> 'Sobrando' com destaque em verde
 */
export function renderTipoBadge(tipo: any): React.ReactNode {
  const norm = String(tipo || '').trim().toLowerCase();
  if (norm === 'falta') {
    return (
      <span className="rp-conflict-tipo-badge is-falta">
        Faltando
      </span>
    );
  }
  if (norm === 'sobra') {
    return (
      <span className="rp-conflict-tipo-badge is-sobra">
        Sobrando
      </span>
    );
  }
  return tipo ? <span className="rp-conflict-tipo-badge">{String(tipo)}</span> : '-';
}

/**
 * Renderiza checkbox visual para o campo Status:
 * - 'pendente' -> checkbox desmarcada
 * - 'conferido' -> checkbox marcada
 * Não renderiza texto "Pendente" ou "Conferido" como valor, somente a checkbox não interativa.
 */
export function renderStatusCheckbox(status: any): React.ReactNode {
  const isConferido =
    String(status || '').trim().toLowerCase() === 'conferido' || status === true || status === 1;

  return (
    <div className="rp-conflict-status-wrapper">
      <input
        type="checkbox"
        checked={isConferido}
        readOnly
        disabled
        tabIndex={-1}
        className="rp-conflict-status-checkbox"
        aria-label={isConferido ? 'Conferido' : 'Pendente'}
      />
    </div>
  );
}

export function ConflictResolutionModal({
  isOpen,
  conflicts,
  onResolve,
  onSnooze
}: ConflictResolutionModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isResolving, setIsResolving] = useState(false);

  // Garante que o índice selecionado esteja dentro dos limites atuais
  useEffect(() => {
    if (currentIndex >= conflicts.length && conflicts.length > 0) {
      setCurrentIndex(conflicts.length - 1);
    }
  }, [conflicts.length, currentIndex]);

  // Bloqueio estrito de tecla ESC e suporte a navegação por setas (Left / Right)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          setCurrentIndex((prev) => Math.max(0, prev - 1));
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < conflicts.length - 1) {
          setCurrentIndex((prev) => Math.min(conflicts.length - 1, prev + 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, currentIndex, conflicts.length]);

  const activeConflict = useMemo(() => {
    if (!conflicts || conflicts.length === 0) return null;
    return conflicts[Math.min(currentIndex, conflicts.length - 1)];
  }, [conflicts, currentIndex]);

  if (!isOpen || !activeConflict) return null;

  const local = activeConflict.local_data || {};
  const remote = activeConflict.remote_data || {};

  // Formatação de data / período no padrão brasileiro DD/MM/YYYY (sem fuso horário)
  const rawLocalDate =
    local.data_formatada ||
    (local.dia && local.mes && local.ano
      ? `${String(local.dia).padStart(2, '0')}/${String(local.mes).padStart(2, '0')}/${local.ano}`
      : null) ||
    local.data ||
    '-';

  const rawRemoteDate =
    remote.data_formatada ||
    (remote.dia && remote.mes && remote.ano
      ? `${String(remote.dia).padStart(2, '0')}/${String(remote.mes).padStart(2, '0')}/${remote.ano}`
      : null) ||
    remote.data ||
    '-';

  const localDateStr = formatConflictDate(rawLocalDate, local);
  const remoteDateStr = formatConflictDate(rawRemoteDate, remote);

  const localTipo = local.tipo || local.operacao || '';
  const remoteTipo = remote.tipo || remote.operacao || '';

  const isLocalConferido =
    String(local.status || '').trim().toLowerCase() === 'conferido' || local.status === true || local.status === 1;
  const isRemoteConferido =
    String(remote.status || '').trim().toLowerCase() === 'conferido' || remote.status === true || remote.status === 1;

  const localCriado = local.criado_em || local.created_at;
  const remoteCriado = remote.criado_em || remote.created_at;

  const localAtualizado = local.atualizado_em || local.updated_at;
  const remoteAtualizado = remote.atualizado_em || remote.updated_at;

  // Lista de campos comparativos com detecção automática de divergência
  const rawFields = [
    {
      id: 'loterica',
      label: 'Lotérica',
      icon: <Tag size={13} />,
      localVal: local.loterica || activeConflict.loterica || '-',
      remoteVal: remote.loterica || activeConflict.loterica || '-',
      show: Boolean(local.loterica || remote.loterica || activeConflict.loterica)
    },
    {
      id: 'data',
      label: 'Data / Período',
      icon: <Calendar size={13} />,
      localVal: localDateStr,
      remoteVal: remoteDateStr,
      show: true
    },
    {
      id: 'funcionario',
      label: 'Funcionário / Origem',
      icon: <User size={13} />,
      localVal: local.funcionario || '-',
      remoteVal: remote.funcionario || '-',
      show: true
    },
    {
      id: 'tipo',
      label: 'Operação / Tipo',
      icon: <Tag size={13} />,
      localVal: renderTipoBadge(localTipo),
      remoteVal: renderTipoBadge(remoteTipo),
      isDiff: String(localTipo).trim().toLowerCase() !== String(remoteTipo).trim().toLowerCase(),
      show: Boolean(localTipo || remoteTipo)
    },
    {
      id: 'valor',
      label: 'Valor',
      icon: <DollarSign size={13} />,
      localVal: formatCurrency(local.valor),
      remoteVal: formatCurrency(remote.valor),
      isDiff:
        local.valor !== undefined && remote.valor !== undefined && local.valor !== '-' && remote.valor !== '-'
          ? Number(local.valor) !== Number(remote.valor)
          : undefined,
      show: local.valor !== undefined || remote.valor !== undefined
    },
    {
      id: 'status',
      label: 'Status',
      icon: <Check size={13} />,
      localVal: renderStatusCheckbox(local.status),
      remoteVal: renderStatusCheckbox(remote.status),
      isDiff: isLocalConferido !== isRemoteConferido,
      show: true
    },
    {
      id: 'cliente',
      label: 'Cliente',
      icon: <User size={13} />,
      localVal: local.cliente || '-',
      remoteVal: remote.cliente || '-',
      show: Boolean(local.cliente || remote.cliente)
    },
    {
      id: 'criado_em',
      label: 'Criado',
      icon: <Clock size={13} />,
      localVal: formatConflictDateTime(localCriado),
      remoteVal: formatConflictDateTime(remoteCriado),
      isDiff: formatConflictDateTime(localCriado) !== formatConflictDateTime(remoteCriado),
      show: Boolean(localCriado || remoteCriado)
    },
    {
      id: 'atualizado_em',
      label: 'Atualizado',
      icon: <Clock size={13} />,
      localVal: formatConflictDateTime(localAtualizado),
      remoteVal: formatConflictDateTime(remoteAtualizado),
      isDiff: formatConflictDateTime(localAtualizado) !== formatConflictDateTime(remoteAtualizado),
      show: Boolean(localAtualizado || remoteAtualizado)
    },
    {
      id: 'deleted',
      label: 'Situação do Registro',
      icon: <FileText size={13} />,
      localVal: local.deleted ? 'Excluído no computador' : 'Ativo',
      remoteVal: remote.deleted ? 'Excluído no Google Drive' : 'Ativo',
      show: Boolean(local.deleted || remote.deleted)
    }
  ];

  // Chaves técnicas ou já mapeadas que NÃO devem ser apresentadas na comparação
  const ignoredKeys = new Set([
    'id', 'entry_id', 'loterica', 'ano', 'mes', 'dia', 'data', 'data_formatada',
    'valor', 'tipo', 'operacao', 'funcionario', 'cliente', 'status', 'observacoes',
    'observacao', 'deleted', 'criado_em', 'created_at', 'atualizado_em', 'updated_at',
    'is_demo', 'version', 'hash', '_rev'
  ]);

  const allExtraKeys = Array.from(new Set([...Object.keys(local), ...Object.keys(remote)]))
    .filter((k) => !ignoredKeys.has(k));

  const extraFields = allExtraKeys.map((k) => ({
    id: k,
    label: k,
    icon: <FileText size={13} />,
    localVal: typeof local[k] === 'object' ? JSON.stringify(local[k]) : String(local[k] ?? '-'),
    remoteVal: typeof remote[k] === 'object' ? JSON.stringify(remote[k]) : String(remote[k] ?? '-'),
    show: true,
    isDiff: undefined
  }));

  const fields = [...rawFields.filter((f) => f.show !== false), ...extraFields]
    .map((f) => {
      const isDifferent =
        f.isDiff !== undefined
          ? f.isDiff
          : normalizeVal(f.localVal).toLowerCase() !== normalizeVal(f.remoteVal).toLowerCase();
      return { ...f, isDifferent };
    });

  const handleChoose = async (choice: 'local' | 'remote') => {
    if (isResolving) return;
    setIsResolving(true);
    try {
      await onResolve(activeConflict.id, choice);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div
      className="rp-conflict-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
      data-testid="conflict-resolution-overlay"
      onClick={(e) => {
        // Bloqueia fechamento ao clicar no backdrop escurecido
        e.stopPropagation();
      }}
    >
      <div
        className="rp-conflict-modal"
        onClick={(e) => e.stopPropagation()}
        data-testid="conflict-resolution-modal"
      >
        {/* Cabeçalho do Modal */}
        <header className="rp-conflict-header">
          <div className="rp-conflict-header-title">
            <span className="rp-conflict-badge-icon">
              <AlertTriangle size={18} />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 id="conflict-modal-title">Conflito de Sincronização</h2>
                {activeConflict.fileKey && (
                  <span className="rp-conflict-target-badge">{activeConflict.fileKey}</span>
                )}
                {!activeConflict.fileKey && activeConflict.entry_id && (
                  <span className="rp-conflict-target-badge">Registro #{activeConflict.entry_id}</span>
                )}
              </div>
              <p>Foram detectadas alterações simultâneas entre este computador e o Google Drive. Escolha qual versão deve prevalecer.</p>
            </div>
          </div>

          {/* Navegação entre múltiplos conflitos */}
          <div className="rp-conflict-nav">
            <span className="rp-conflict-counter">
              Conflito <strong>{currentIndex + 1}</strong> de <strong>{conflicts.length}</strong>
            </span>
            <div className="rp-conflict-nav-buttons">
              <button
                type="button"
                className="rp-conflict-nav-btn"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0 || isResolving}
                title="Conflito anterior (Seta para a esquerda)"
                aria-label="Conflito anterior"
              >
                <ArrowLeft size={14} />
              </button>
              <button
                type="button"
                className="rp-conflict-nav-btn"
                onClick={() => setCurrentIndex((prev) => Math.min(conflicts.length - 1, prev + 1))}
                disabled={currentIndex >= conflicts.length - 1 || isResolving}
                title="Próximo conflito (Seta para a direita)"
                aria-label="Próximo conflito"
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </header>

        {/* Corpo da Comparação Lado a Lado */}
        <div className="rp-conflict-comparison">
          {/* Lado Esquerdo: Versão Local */}
          <div className="rp-conflict-column rp-conflict-column-local">
            <div className="rp-conflict-column-header">
              <HardDrive size={15} />
              <div>
                <strong>Versão Local</strong>
                <span>(Neste computador)</span>
              </div>
            </div>

            <div className="rp-conflict-fields-list">
              {fields.map((f) => (
                <div
                  key={`local-${f.id}`}
                  className={`rp-conflict-field-row ${f.isDifferent ? 'is-divergent' : ''}`}
                >
                  <span className="rp-conflict-field-label">
                    {f.icon}
                    {f.label}
                    {f.isDifferent && <span className="rp-conflict-diff-tag">Divergente</span>}
                  </span>
                  <div className="rp-conflict-field-value">
                    {f.localVal}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="rp-conflict-action-btn rp-btn-keep-local"
              onClick={() => handleChoose('local')}
              disabled={isResolving}
            >
              <HardDrive size={15} />
              Manter versão local
            </button>
          </div>

          {/* Divisor Visual */}
          <div className="rp-conflict-divider" aria-hidden="true">
            <span>VS</span>
          </div>

          {/* Lado Direito: Versão Remota */}
          <div className="rp-conflict-column rp-conflict-column-remote">
            <div className="rp-conflict-column-header">
              <Cloud size={15} />
              <div>
                <strong>Versão Remota</strong>
                <span>(Google Drive)</span>
              </div>
            </div>

            <div className="rp-conflict-fields-list">
              {fields.map((f) => (
                <div
                  key={`remote-${f.id}`}
                  className={`rp-conflict-field-row ${f.isDifferent ? 'is-divergent' : ''}`}
                >
                  <span className="rp-conflict-field-label">
                    {f.icon}
                    {f.label}
                    {f.isDifferent && <span className="rp-conflict-diff-tag">Divergente</span>}
                  </span>
                  <div className="rp-conflict-field-value">
                    {f.remoteVal}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="rp-conflict-action-btn rp-btn-use-remote"
              onClick={() => handleChoose('remote')}
              disabled={isResolving}
            >
              <Cloud size={15} />
              Usar versão remota
            </button>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <footer className="rp-conflict-footer">
          <div className="rp-conflict-snooze-group">
            <button
              type="button"
              className="rp-conflict-snooze-btn"
              onClick={() => onSnooze(60)}
              disabled={isResolving}
              title="Adia a decisão por 1 minuto (60 segundos) sem perder dados ou resolver o conflito"
            >
              <Clock size={14} />
              Adiar resolução por 1 minuto
            </button>
          </div>

          <span className="rp-conflict-footer-hint">
            O conflito permanecerá salvo de forma segura no banco de dados até sua resolução.
          </span>
        </footer>
      </div>
    </div>
  );
}
