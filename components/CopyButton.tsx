'use client';
import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setLabel('Copied'); } catch { setLabel('Select & copy'); }
    setTimeout(() => setLabel('Copy'), 1800);
  }
  return <button type="button" className="btn ghost small" onClick={copy}>{label}</button>;
}
