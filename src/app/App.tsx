import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Clock3, FileText, PlusSquare, Settings, ShieldCheck, X, Minus, Maximize2, Check } from 'lucide-react';
import brandIcon from '../../assets/icon-app.png';

export type ModuleKey = 'protege' | 'pix' | 'relatorio';
type RouteKey = ModuleKey | 'dashboard';
const definitions: Record<ModuleKey, { title: string; description: string; icon: React.ReactNode }> = {
  protege: { title: 'Protege', description: 'Depósitos, coletas, cédulas e histórico de importações.', icon: <ShieldCheck /> },
  pix: { title: 'Pix', description: 'Conferência de extratos, pendências e histórico.', icon: <Check /> },
  relatorio: { title: 'Relatório', description: 'Faltas, sobras, histórico e sincronização do Drive.', icon: <FileText /> },
};
const components: Record<ModuleKey, React.LazyExoticComponent<React.ComponentType<{ workspaceId: string; isActive: boolean }>>> = {
  protege: lazy(() => import('../modules/protege/ProtegeModule').then((m) => ({ default: m.ProtegeModule }))),
  pix: lazy(() => import('../modules/pix/PixModule').then((m) => ({ default: m.PixModule }))),
  relatorio: lazy(() => import('../modules/relatorio/RelatorioModule').then((m) => ({ default: m.RelatorioModule }))),
};
const windowId = globalThis.crypto?.randomUUID?.() || `window-${Date.now()}`;

export function App() {
  const [route, setRoute] = useState<RouteKey>('dashboard');
  const [visited, setVisited] = useState<ModuleKey[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [reportMigrationDecisionPending, setReportMigrationDecisionPending] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.electronAPI?.shell.getState().then((state) => {
      if (!mounted) return;
      setMinimizeToTray(state.minimizeToTray);
      setReportMigrationDecisionPending(state.reportMigrationDecisionPending);
      if (state.initialModule && state.initialModule !== 'dashboard') {
        setRoute(state.initialModule);
        setVisited([state.initialModule]);
      }
    }).catch(() => {});
    void window.electronAPI?.shell.isMaximized().then((value) => mounted && setIsMaximized(value)).catch(() => {});
    const unsubscribe = window.electronAPI?.shell.onMaximizedChange((value) => setIsMaximized(value));
    return () => { mounted = false; unsubscribe?.(); };
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = 'light'; localStorage.removeItem('lotecontrol-theme'); }, []);
  useEffect(() => {
    const onTraySettingChanged = (event: Event) => setMinimizeToTray(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener('lotecontrol:tray-setting-changed', onTraySettingChanged);
    return () => window.removeEventListener('lotecontrol:tray-setting-changed', onTraySettingChanged);
  }, []);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void window.electronAPI?.shell.openNewWindow(route);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [route]);
  const navigate = useCallback((next: RouteKey) => {
    if (next === 'relatorio' && reportMigrationDecisionPending) {
      return;
    }
    setRoute(next);
    if (next !== 'dashboard') setVisited((current) => current.includes(next) ? current : [...current, next]);
  }, [reportMigrationDecisionPending]);
  const handleTrayChange = useCallback(async (enabled: boolean) => {
    const actual = await window.electronAPI?.shell.setMinimizeToTray(enabled).catch(() => enabled) ?? enabled;
    setMinimizeToTray(actual);
  }, []);
  const continueWithCurrentReport = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    if (!window.confirm('Continuar com o banco atual do Relatório? O banco antigo será mantido sem alterações.')) return;
    try {
      await api.migration.continueWithCurrentReport();
      setReportMigrationDecisionPending((await api.shell.getState()).reportMigrationDecisionPending);
    } catch (error: any) { window.alert(`Não foi possível liberar o Relatório: ${error?.message || error}`); }
  }, []);

  const Current = route !== 'dashboard' ? components[route] : null;
  return <div className="lc-window">
    <header className="lc-topbar app-drag-region">
      <div className="lc-brand app-no-drag"><img src={brandIcon} alt="LoteControl" /></div>
      <nav className="lc-module-nav app-no-drag" aria-label="Navegação principal">
        {(Object.keys(definitions) as ModuleKey[]).map((key) => <button type="button" data-module-nav={key} key={key} className={route === key ? 'selected' : ''} onClick={() => navigate(key)}>{definitions[key].icon}<span>{definitions[key].title}</span></button>)}
        <button type="button" className="lc-new-window" onClick={() => window.electronAPI?.shell.openNewWindow(route)} title="Abrir outra janela (Ctrl+Shift+N)"><PlusSquare size={15} /> Nova janela</button>
      </nav>
      <div className="lc-top-actions app-no-drag">
        <button type="button" className="lc-settings-control" onClick={() => { if (route === 'pix') { window.dispatchEvent(new Event('lotecontrol:open-pix-settings')); return; } if (route === 'relatorio') { window.dispatchEvent(new Event('lotecontrol:open-report-settings')); return; } setSettingsOpen(true); }} aria-label="Configurações" title="Configurações"><Settings size={17} /></button>
        <span className="lc-window-separator" aria-hidden="true" />
        <button type="button" onClick={() => window.electronAPI?.shell.minimize()} aria-label="Minimizar"><Minus size={17} /></button>
        <button type="button" onClick={async () => setIsMaximized(await window.electronAPI?.shell.maximize() ?? false)} aria-label={isMaximized ? 'Restaurar' : 'Maximizar'}><Maximize2 size={14} /></button>
        <button type="button" className="lc-window-close" onClick={() => window.electronAPI?.shell.close()} aria-label="Fechar"><X size={16} /></button>
      </div>
    </header>
    <div className="lc-body">
      <main className="lc-main">
        {route === 'dashboard' ? <section className="lc-dashboard" aria-label="Início">
          {reportMigrationDecisionPending && <div className="lc-migration-alert" role="alert"><span>O Relatório precisa confirmar qual banco local deve usar antes de abrir.</span><button onClick={() => void continueWithCurrentReport()}>Usar banco atual</button></div>}
          <div className="lc-dashboard-heading"><div><p className="lc-eyebrow">LOTECONTROL</p><h1>Selecione um módulo</h1><p>Os módulos compartilham os mesmos dados e serviços.</p></div><img className="lc-dashboard-logo" src={brandIcon} alt="" /></div>
          <div className="lc-module-grid">{(Object.keys(definitions) as ModuleKey[]).map((key) => <button type="button" className={`lc-module-card ${key}`} key={key} onClick={() => navigate(key)}><div className={`lc-card-icon ${key}`}>{definitions[key].icon}</div><h2>{definitions[key].title}</h2><p>{definitions[key].description}</p><span>Abrir módulo <span aria-hidden="true">→</span></span></button>)}</div>
        </section> : <div className="lc-module-host" data-current-module={route}>
          {visited.map((key) => { const Component = components[key]; return <div key={key} className="lc-visited-module" style={{ display: key === route ? 'flex' : 'none' }} aria-hidden={key !== route}><Suspense fallback={<div className="lc-loading">Abrindo {definitions[key].title}…</div>}><Component workspaceId={`${windowId}-${key}`} isActive={key === route} /></Suspense></div>; })}
        </div>}
      </main>
    </div>
    {settingsOpen && <div className="lc-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}><section className="lc-settings-modal" role="dialog" aria-modal="true" aria-labelledby="lc-settings-title">
      <div className="lc-modal-heading"><div className="lc-modal-title-icon"><Settings size={19} /></div><div className="lc-modal-title-copy"><h2 id="lc-settings-title">Configurações</h2><span>Preferências do aplicativo e manutenção</span></div><button type="button" className="lc-icon-button" onClick={() => setSettingsOpen(false)} aria-label="Fechar configurações"><X size={17} /></button></div>
      <div className="lc-settings-body">
        <div className="lc-setting-row"><div className="lc-setting-icon"><Clock3 size={17} /></div><div className="lc-setting-copy"><strong>Minimizar para a bandeja</strong><span>Continuar executando em segundo plano ao fechar a última janela</span></div><button type="button" role="switch" aria-checked={minimizeToTray} className={`lc-switch ${minimizeToTray ? 'on' : ''}`} onClick={() => void handleTrayChange(!minimizeToTray)}><span /></button></div>
        <div className="lc-setting-note">Uma bandeja e serviços compartilhados atendem todas as janelas abertas.</div>
      </div>
    </section></div>}
  </div>;
}
