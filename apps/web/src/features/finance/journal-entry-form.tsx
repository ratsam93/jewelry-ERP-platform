'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface JournalLine {
  accountId: string;
  debitPaise: number;
  creditPaise: number;
  description: string;
}

/** Why a journal cannot be saved yet (shown next to the disabled Save button), or null when it can. */
export function journalBlockReason(lines: JournalLine[]): string | null {
  const debit = lines.reduce((s, l) => s + l.debitPaise, 0);
  const credit = lines.reduce((s, l) => s + l.creditPaise, 0);
  if (debit + credit === 0) return 'Enter an amount: at least one debit line and one credit line are needed.';
  if (lines.some((l) => l.debitPaise + l.creditPaise > 0 && !l.accountId)) return 'Select an account on every line that has an amount.';
  if (debit !== credit) return `Debits and credits must balance. Difference: ${((Math.abs(debit - credit)) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if (lines.some((l) => l.debitPaise > 0 && l.creditPaise > 0)) return 'A line cannot have both a debit and a credit amount.';
  return null;
}

interface JournalEntryFormProps {
  accounts: Array<{ id: string; accountCode: string; name: string }>;
  onSubmit: (data: {
    date: string;
    description: string;
    reference: string;
    lines: JournalLine[];
  }) => void;
  isLoading?: boolean;
}

export function JournalEntryForm({ accounts, onSubmit, isLoading }: JournalEntryFormProps) {
  const [date, setDate] = React.useState(new Date().toISOString().split('T')[0]!);
  const [description, setDescription] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [lines, setLines] = React.useState<JournalLine[]>([
    { accountId: '', debitPaise: 0, creditPaise: 0, description: '' },
    { accountId: '', debitPaise: 0, creditPaise: 0, description: '' },
  ]);

  const totalDebit = lines.reduce((sum, l) => sum + l.debitPaise, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.creditPaise, 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;
  const blockReason = journalBlockReason(lines);

  const addLine = () => {
    setLines([...lines, { accountId: '', debitPaise: 0, creditPaise: 0, description: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof JournalLine, value: string | number) => {
    setLines(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) return;
    onSubmit({ date, description, reference, lines });
  };

  const formatAmount = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-foreground">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Journal entry description"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Reference</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Optional reference"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Lines */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-medium">Account</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-right font-medium">Debit</th>
              <th className="px-4 py-2 text-right font-medium">Credit</th>
              <th className="w-10 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-b">
                <td className="px-4 py-2">
                  <select
                    value={line.accountId}
                    onChange={(e) => updateLine(index, 'accountId', e.target.value)}
                    className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                    required
                  >
                    <option value="">Select account</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountCode} - {acc.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(index, 'description', e.target.value)}
                    placeholder="Line description"
                    className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={line.debitPaise / 100 || ''}
                    onChange={(e) => updateLine(index, 'debitPaise', Math.round(parseFloat(e.target.value || '0') * 100))}
                    placeholder="0.00"
                    className="w-full rounded border border-input bg-background px-2 py-1 text-right text-sm"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={line.creditPaise / 100 || ''}
                    onChange={(e) => updateLine(index, 'creditPaise', Math.round(parseFloat(e.target.value || '0') * 100))}
                    placeholder="0.00"
                    className="w-full rounded border border-input bg-background px-2 py-1 text-right text-sm"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length <= 2}
                    className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30">
              <td colSpan={2} className="px-4 py-2 text-right font-medium">
                Total
              </td>
              <td className="px-4 py-2 text-right font-bold">{formatAmount(totalDebit)}</td>
              <td className="px-4 py-2 text-right font-bold">{formatAmount(totalCredit)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {blockReason && (
        <p id="journal-save-hint" role="status" className="text-sm text-destructive">
          {blockReason}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Plus className="h-4 w-4" /> Add Line
        </button>
        <button
          type="submit"
          disabled={!isBalanced || Boolean(blockReason) || isLoading}
          aria-describedby={blockReason ? 'journal-save-hint' : undefined}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Save Journal Entry'}
        </button>
      </div>
    </form>
  );
}
