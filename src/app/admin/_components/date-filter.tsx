import { input, label } from "../menu/form-styles";

/** A GET form, so filtered pages keep a shareable URL. */
export function DateFilter({ from, to, children }: { from: string; to: string; children?: React.ReactNode }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className={label}>
        From
        <input type="date" name="from" defaultValue={from} className={input} />
      </label>
      <label className={label}>
        To
        <input type="date" name="to" defaultValue={to} className={input} />
      </label>
      {children}
      <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white">
        Show
      </button>
    </form>
  );
}
