import React from 'react';
import { App as PixApp } from './implementation/App';

export function PixModule({ workspaceId, isActive }: { workspaceId: string; isActive: boolean }) {
  return <PixApp workspaceId={workspaceId} isActive={isActive} />;
}
