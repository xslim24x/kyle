import {
  useEffect,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id: string }>, { id })
        : children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="dialog-title">
      <header>
        <h2 id="dialog-title">{title}</h2>
        <button
          type="button"
          className="icon"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Form({
  onSubmit,
  children,
}: {
  onSubmit: (data: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    if (ref.current) ref.current.textContent = "";
    try {
      await onSubmit(data);
    } catch (error) {
      if (ref.current) ref.current.textContent = (error as Error).message;
    } finally {
      if (button) button.disabled = false;
    }
  }
  return (
    <form onSubmit={submit}>
      {children}
      <p className="error" role="alert" ref={ref} />
    </form>
  );
}
export const text = (f: FormData, key: string) => String(f.get(key) ?? "");
export const num = (f: FormData, key: string) => Number(f.get(key));
export const money = (cents: number | null) =>
  cents === null
    ? "Not set"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
      }).format(cents / 100);
