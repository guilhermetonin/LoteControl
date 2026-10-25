// ==========================================================================
// CheckProtege - Constantes e Configurações de Lotéricas
// ==========================================================================

export const LOTERICAS = {
  cacula: {
    key: 'cacula',
    nome: 'Caçula',
    cnpj: '03354194000111',
    cnpjFormatado: '03.354.194/0001-11',
    cor: '#2563eb', // blue-600
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300'
  },
  sorteGrande: {
    key: 'sorteGrande',
    nome: 'Sorte Grande',
    cnpj: '05304693000120',
    cnpjFormatado: '05.304.693/0001-20',
    cor: '#059669', // emerald-600
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300'
  },
  pupins: {
    key: 'pupins',
    nome: 'Pupins',
    cnpj: '38229011000110',
    cnpjFormatado: '38.229.011/0001-10',
    cor: '#7c3aed', // purple-600
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300'
  }
};

// Mapa de CNPJ limpo para configuração da lotérica
export const CNPJ_TO_LOTERICA = {
  '03354194000111': LOTERICAS.cacula,
  '38229011000110': LOTERICAS.pupins,
  '05304693000120': LOTERICAS.sorteGrande
};

export function formatarCNPJ(cnpj) {
  const digits = String(cnpj || '').replace(/\D/g, '').padStart(14, '0');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatarMoeda(valor) {
  const num = typeof valor === 'number' ? valor : parseFloat(valor) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarDataHora(str) {
  if (!str) return '';
  return String(str).trim();
}

export function extrairDiaMes(dataStr) {
  if (!dataStr) return '';
  // Esperado "DD/MM/AAAA HH:mm:ss" ou "DD/MM/AAAA"
  const partes = String(dataStr).trim().split(' ')[0].split('/');
  if (partes.length >= 2) {
    const dia = partes[0].padStart(2, '0');
    const mes = partes[1].padStart(2, '0');
    return `${dia}/${mes}`;
  }
  return dataStr;
}

export function extrairAno(dataStr) {
  if (!dataStr) return null;
  const partes = String(dataStr).trim().split(' ')[0].split('/');
  if (partes.length >= 3) {
    return parseInt(partes[2], 10);
  }
  return null;
}
