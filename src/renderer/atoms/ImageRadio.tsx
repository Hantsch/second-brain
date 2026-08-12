import type { ChangeEventHandler, ReactNode } from 'react';

export interface ImageRadioProps {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  preview: ReactNode;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

/** A radio choice whose visual sample is part of the same accessible label. */
export function ImageRadio({ name, value, label, checked, preview, onChange }: ImageRadioProps) {
  return (
    <label className="sb-image-radio">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="sb-image-radio-preview" aria-hidden="true">
        {preview}
      </span>
      <span className="sb-image-radio-label">
        <span className="gs-radio-dot" aria-hidden="true" />
        <span className="gs-ctrl-label">{label}</span>
      </span>
    </label>
  );
}
