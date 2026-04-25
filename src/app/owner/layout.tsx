import { AppShell } from '@/components/AppShell';
import { StorageInit } from './StorageInit';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <StorageInit />
      {children}
    </AppShell>
  );
}
