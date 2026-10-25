import React, { useMemo, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { PixTransaction } from '../services/statementParser';
import { formatCurrencyBr } from '../utils/rules';

interface TransferPendentesModalProps {
  mode: 'copy' | 'move';
  transactions: PixTransaction[];
  onConfirm: (targetLoterica: string, fallbackMonth: number, fallbackYear: number) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

const LOTERICAS = ['CAÇULA', 'SORTE GRANDE', 'PUPINS'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const TransferPendentesModal: React.FC<TransferPendentesModalProps> = ({
  mode,
  transactions,
  onConfirm,
  onCancel,
  busy = false,
}) => {
  const [loterica, setLoterica] = useState('CAÇULA');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const total = useMemo(
    () => transactions.reduce((sum, tx) => sum + tx.valorCentavos, 0) / 100,
    [transactions],
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 app-no-drag" role="presentation">
      <section
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 id="transfer-title" className="text-base font-extrabold text-slate-900">
              {mode === 'move' ? 'Mover para o Relatório' : 'Copiar para o Relatório'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {transactions.length} {transactions.length === 1 ? 'pendente' : 'pendentes'} · {formatCurrencyBr(total)}
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700">
            Lotérica de destino
            <select value={loterica} onChange={(event) => setLoterica(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800">
              {LOTERICAS.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <p className="text-xs font-bold text-blue-950">Mês e ano de referência</p>
            <p className="mt-1 text-[11px] leading-relaxed text-blue-900/80">
              O sistema usa a data do extrato quando ela estiver completa. Para linhas sem data completa, usa o dia do documento junto com o mês e o ano abaixo.
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <select aria-label="Mês de referência" value={month} onChange={(event) => setMonth(Number(event.target.value))} className="rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs text-slate-800">
                {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select>
              <input aria-label="Ano de referência" type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs text-slate-800" />
            </div>
          </div>

          {mode === 'move' && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
              Após salvar no Relatório, esses lançamentos serão marcados como conferidos no Pix e sairão da lista de pendentes. Você ainda poderá desfazer essa marcação com Ctrl+Z.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button
            type="button"
            onClick={() => onConfirm(loterica, month, year)}
            disabled={busy || transactions.length === 0 || year < 2000 || year > 2100}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            <span>{busy ? 'Salvando…' : mode === 'move' ? 'Mover pendentes' : 'Copiar pendentes'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
};
