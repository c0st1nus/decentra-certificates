import type { ReactNode } from "react";

type FileInputFieldProps = {
  accept: string;
  disabled?: boolean;
  helperText?: string;
  icon: ReactNode;
  id: string;
  label: string;
  onFileChange: (file: File | null) => void;
};

export function FileInputField({
  accept,
  disabled,
  helperText,
  icon,
  id,
  label,
  onFileChange,
}: FileInputFieldProps) {
  return (
    <label className="block text-sm font-medium text-white/80" htmlFor={id}>
      {label}
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4">
        {icon}
        <input
          id={id}
          accept={accept}
          className="admin-file-input"
          disabled={disabled}
          type="file"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </div>
      {helperText ? <p className="mt-2 text-xs leading-5 text-white/55">{helperText}</p> : null}
    </label>
  );
}
