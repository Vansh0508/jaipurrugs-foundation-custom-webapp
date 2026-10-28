"use client";

import { Input, ListBox, Select, TextField } from "@heroui/react";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/visits/constants";

/** "+91 98765 43210" -> { code: "+91", number: "98765 43210" }. */
export function splitPhone(value: string | null | undefined) {
  const phone = value?.trim() ?? "";
  const code = COUNTRY_CODES.map((c) => c.id as string)
    .sort((a, b) => b.length - a.length)
    .find((c) => phone.startsWith(c));
  if (!code) return { code: DEFAULT_COUNTRY_CODE, number: phone };
  return { code, number: phone.slice(code.length).trim() };
}

/** The stored form of a phone number: "+91 98765 43210", or "" when no number was typed. */
export function joinPhone(code: string, number: string) {
  const trimmed = number.trim();
  return trimmed ? `${code} ${trimmed}` : "";
}

/** A country-code picker next to the number itself. */
export function PhoneField({
  label,
  code,
  onCodeChange,
  number,
  onNumberChange,
  isRequired,
  placeholder = "98765 43210",
}: {
  label: string;
  code: string;
  onCodeChange: (code: string) => void;
  number: string;
  onNumberChange: (number: string) => void;
  isRequired?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">
        {label}
        {isRequired ? <span className="text-danger"> *</span> : null}
      </span>
      <div className="grid grid-cols-[7.5rem_1fr] gap-2">
        <Select
          aria-label={`${label} country code`}
          value={code}
          onChange={(key) => onCodeChange(String(key ?? DEFAULT_COUNTRY_CODE))}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover className="min-w-56">
            <ListBox>
              {COUNTRY_CODES.map((c) => (
                <ListBox.Item key={c.id} id={c.id} textValue={c.id}>
                  {c.id}
                  <span className="text-muted">{c.label}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <TextField aria-label={label} isRequired={isRequired} value={number} onChange={onNumberChange}>
          <Input placeholder={placeholder} type="tel" />
        </TextField>
      </div>
    </div>
  );
}
