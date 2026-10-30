import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CloudOff, RefreshCw, ShieldAlert } from 'lucide-react';

export interface SyncStatusInfo {
  status?: string;
  conflictCount?: number;
  pendingCount?: number;
  userEmail?: string;
  userName?: string;
  lastSyncTime?: string | null;
  lastError?: string | null;
  isSyncing?: boolean;
}

export interface SyncStatusBadgeProps {
  syncStatus: SyncStatusInfo;
  conflictsCount?: number;
  onClick?: () => void;
  className?: string;
}

export type VisualSyncState = 'conflict' | 'offline' | 'auth-error' | 'syncing' | 'synced' | 'connected' | 'disconnected';

export function SyncStatusBadge({
  syncStatus,
  conflictsCount,
  onClick,
  className = '',
}: SyncStatusBadgeProps) {
  const [showRecentSuccess, setShowRecentSuccess] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSyncingRef = useRef<boolean>(false);
  const prevLastSyncTimeRef = useRef<string | null>(null);

  // Normalização dos dados de entrada
  const rawStatus = String(syncStatus?.status || '').trim();
  const rawStatusLower = rawStatus.toLowerCase();
  const totalConflicts = Number(conflictsCount ?? syncStatus?.conflictCount ?? 0);
  const hasConflicts = totalConflicts > 0 || rawStatusLower.includes('conflito');

  // Se o status for explicitamente 'sincronizado', nunca deve ser considerado 'syncing'
  const isSyncing = Boolean(
    (syncStatus?.isSyncing && !rawStatusLower.includes('sincronizado')) ||
    (rawStatusLower === 'sincronizando' && syncStatus?.isSyncing !== false)
  );

  const lastErrorMessage = String(syncStatus?.lastError || '');
  const isAuthError =
    rawStatusLower.includes('autorização') ||
    rawStatusLower.includes('expirada') ||
    /invalid_grant|unauthorized|invalid_token|status 401|não autenticado|expirou/i.test(lastErrorMessage);

  const isOffline =
    !isAuthError &&
    (rawStatusLower === 'offline' ||
      /enotfound|econnrefused|etimedout|fetch failed|network|failed to fetch/i.test(lastErrorMessage));

  const isConfigured = Boolean(syncStatus?.userEmail);

  // Monitora conclusão de sincronização para exibir "Sincronizado" por 5 segundos
  useEffect(() => {
    const wasSyncing = prevSyncingRef.current;
    const currentSyncTime = syncStatus?.lastSyncTime || null;
    const syncTimeChanged = Boolean(currentSyncTime && currentSyncTime !== prevLastSyncTimeRef.current);

    prevSyncingRef.current = isSyncing;
    prevLastSyncTimeRef.current = currentSyncTime;

    // Se houver conflito, erro offline ou sincronização ativa, limpa imediatamente o estado temporário
    if (hasConflicts || isOffline || isAuthError || isSyncing) {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      setShowRecentSuccess(false);
      return;
    }

    // Detecta conclusão com sucesso:
    // Transição de syncing -> idle COM status 'sincronizado' OU chegada de um novo lastSyncTime
    const justCompletedSuccess = (wasSyncing && !isSyncing && (rawStatusLower.includes('sincronizado') || rawStatusLower.includes('pronto'))) ||
                                 (syncTimeChanged && rawStatusLower.includes('sincronizado'));

    if (justCompletedSuccess) {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      setShowRecentSuccess(true);
      successTimerRef.current = setTimeout(() => {
        setShowRecentSuccess(false);
        successTimerRef.current = null;
      }, 5000);
    }
  }, [isSyncing, hasConflicts, isOffline, isAuthError, rawStatusLower, syncStatus?.lastSyncTime]);

  // Limpeza de timer na desmontagem
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  // Determina o estado visual respeitando a ordem estrita de prioridades:
  // 1. Conflito
  // 2. Offline / Erro de Autorização
  // 3. Sincronizando
  // 4. Sincronizado (durante 5 segundos)
  // 5. Conectado (Neutro)
  // 6. Desconectado / Não configurado
  let visualState: VisualSyncState = 'disconnected';
  let badgeLabel = 'Não configurado';
  let tooltip = 'Google Drive não configurado. Clique para configurar.';

  if (hasConflicts) {
    visualState = 'conflict';
    const countDisplay = totalConflicts > 0 ? totalConflicts : 1;
    badgeLabel = `Conflito (${countDisplay})`;
    tooltip = `${countDisplay} conflito(s) de sincronização pendente(s). Clique para revisar e resolver.`;
  } else if (isAuthError) {
    visualState = 'auth-error';
    badgeLabel = 'Reconectar conta';
    tooltip = 'A autorização da conta Google expirou ou foi revogada. Clique para reconectar.';
  } else if (isOffline) {
    visualState = 'offline';
    badgeLabel = 'Offline';
    tooltip = 'Sem conexão com o Google Drive. Alterações locais continuam seguras no banco de dados.';
  } else if (isSyncing) {
    visualState = 'syncing';
    badgeLabel = 'Sincronizando';
    tooltip = 'Sincronizando lançamentos com o Google Drive...';
  } else if (showRecentSuccess) {
    visualState = 'synced';
    badgeLabel = 'Sincronizado';
    tooltip = 'Sincronização concluída com sucesso.';
  } else if (isConfigured) {
    visualState = 'connected';
    badgeLabel = 'Conectado';
    const emailInfo = syncStatus?.userEmail ? ` (${syncStatus.userEmail})` : '';
    tooltip = `Conta Google conectada${emailInfo}. Pronto para sincronizar.`;
  }

  return (
    <button
      type="button"
      className={`rp-sync-badge rp-sync-badge-${visualState} ${className}`}
      onClick={onClick}
      title={tooltip}
      aria-label={`Status da sincronização: ${badgeLabel}. Configurações do Relatório`}
      data-testid="sync-status-badge"
      data-state={visualState}
    >
      <span className="rp-sync-badge-indicator" aria-hidden="true">
        {visualState === 'syncing' && <RefreshCw size={13} className="rp-sync-spin" />}
        {visualState === 'conflict' && <AlertTriangle size={13} />}
        {visualState === 'offline' && <CloudOff size={13} />}
        {visualState === 'auth-error' && <ShieldAlert size={13} />}
        {visualState === 'synced' && <span className="rp-sync-dot is-synced" />}
        {visualState === 'connected' && <span className="rp-sync-dot is-connected" />}
        {visualState === 'disconnected' && <span className="rp-sync-dot is-disconnected" />}
      </span>
      <span className="rp-sync-badge-text">{badgeLabel}</span>
    </button>
  );
}
