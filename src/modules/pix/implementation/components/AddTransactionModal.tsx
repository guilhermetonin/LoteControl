import React, { useState } from 'react';
import { X, Plus, Check } from 'lucide-react';
import type { PixTransaction } from '../services/statementParser';
import { parseMonetaryValue } from '../utils/rules';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (transaction: PixTransaction) => void;
  availableHistoricos: string[];
  defaultDia?: string;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  availableHistoricos,
  defaultDia = 'DIA 01',
}) => {
  const [valorStr, setValorStr] = useState('');
  const [historico, setHistorico] = useState(availableHistoricos[0] || 'CRED PIX CHAVE');
  const [customHistorico, setCustomHistorico] = useState('');
  const [documento, setDocumento] = useState('');
  const [dia, setDia] = useState(defaultDia !== 'TODOS' ? defaultDia : 'DIA 01');
  const [horario, setHorario] = useState('');
  const [observacao, setObservacao] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseMonetaryValue(valorStr);
    if (!parsed || parsed.valor === 0) {
      setError('Por favor, informe um valor monetário válido (ex: 15,00).');
      return;
    }

    const finalHistorico = historico === '__custom__' ? customHistorico.trim() : historico;
    if (!finalHistorico) {
      setError('Por favor, informe a descrição do histórico PIX.');
      return;
    }

    const finalDia = dia.toUpperCase().startsWith('DIA ')
      ? dia.toUpperCase()
      : `DIA ${dia.padStart(2, '0')}`;

    const newTx: PixTransaction = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      rowNumber: 9999,
      historico: finalHistorico,
      documento: documento.trim() || String(Math.floor(Math.random() * 900000 + 100000)),
      valor: parsed.valor,
      valorCentavos: parsed.centavos,
      rawValor: parsed.formattedBr,
      formattedBr: parsed.formattedBr,
      dia: finalDia,
      horario: horario.trim() || null,
      isPix: true,
      observacao: observacao.trim() || undefined,
    };

    onAdd(newTx);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150 app-no-drag">
      <div className="fixed inset-0 cursor-pointer" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden z-10 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-[#12385f] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Adicionar Lançamento PIX</h3>
              <p className="text-[11px] text-slate-300">Incluir novo recebimento manualmente na conferência</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Valor (R$) *
            </label>
            <input
              type="text"
              autoFocus
              placeholder="ex: 15,00 ou 1.250,50"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
              className="w-full p-2.5 text-sm font-extrabold bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#12385f] focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Dia *
              </label>
              <input
                type="text"
                placeholder="ex: DIA 01"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className="w-full p-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#12385f]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Horário (opcional)
              </label>
              <input
                type="text"
                placeholder="ex: 14:35"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full p-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#12385f]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Histórico PIX *
            </label>
            <select
              value={historico}
              onChange={(e) => setHistorico(e.target.value)}
              className="w-full p-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#12385f] mb-2 cursor-pointer"
            >
              {availableHistoricos.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
              <option value="__custom__">+ Outro histórico...</option>
            </select>
            {historico === '__custom__' && (
              <input
                type="text"
                placeholder="Digite a descrição do histórico..."
                value={customHistorico}
                onChange={(e) => setCustomHistorico(e.target.value)}
                className="w-full p-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#12385f]"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Nº Documento (opcional)
            </label>
            <input
              type="text"
              placeholder="ex: 010523"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              className="w-full p-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#12385f] font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Observação (opcional)
            </label>
            <input
              type="text"
              placeholder="ex: Pedido Balcão #89"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full p-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#12385f]"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold bg-[#12385f] hover:bg-[#0d2c4c] text-white rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Adicionar Lançamento</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
