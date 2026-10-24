export function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass = (error) => (error ? 'input input-error' : 'input');

export function FormError({ message }) {
  if (!message) return null;
  return <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{message}</p>;
}
