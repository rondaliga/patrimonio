import { Inbox } from 'lucide-react';

export default function EmptyState({ title, children }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <Inbox className="h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{children}</div>}
    </div>
  );
}
