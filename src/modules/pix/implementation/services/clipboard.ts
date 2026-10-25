import type { PixTransaction } from './statementParser';

export interface CopyResult {
  success: boolean;
  count: number;
  message: string;
}

/**
 * Formats a list of PIX transactions into plain text values, one per line.
 * Format: '5,00', '6,00', '-54,00' (Brazilian decimal comma, no R$, preserving negative signs and duplicates).
 */
export function formatValuesForClipboard(transactions: PixTransaction[]): string {
  if (!transactions || transactions.length === 0) {
    return '';
  }
  return transactions.map((t) => t.formattedBr).join('\n');
}

/**
 * Copies the formatted values to the system clipboard with browser fallback.
 */
export async function copyTransactionsToClipboard(
  transactions: PixTransaction[],
  label: 'pendentes' | 'conferidos'
): Promise<CopyResult> {
  const count = transactions.length;

  if (count === 0) {
    return {
      success: false,
      count: 0,
      message: `Nenhum valor ${label} no filtro atual para copiar.`,
    };
  }

  const textToCopy = formatValuesForClipboard(transactions);

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(textToCopy);
    } else if (typeof document !== 'undefined') {
      // Fallback for older browsers or non-HTTPS
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!successful) {
        throw new Error('Falha no fallback de cópia execCommand.');
      }
    } else {
      throw new Error('Ambiente sem suporte a área de transferência.');
    }

    return {
      success: true,
      count,
      message: `${count} ${count === 1 ? 'valor copiado' : 'valores copiados'} com sucesso!`,
    };
  } catch (err: any) {
    return {
      success: false,
      count,
      message: `Erro ao copiar: ${err?.message || 'Permissão negada ou não suportado.'}`,
    };
  }
}
