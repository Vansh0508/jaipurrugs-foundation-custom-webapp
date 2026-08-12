"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchField } from "@heroui/react";

// URL-driven search (?q=...), not a client data store — the list itself is
// still fetched server-side on each navigation. See AGENTS.md §6 on not
// introducing a second client-side data-fetching path for admin data.
export function FormsSearchField({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
    }, 300);
  }

  return (
    <SearchField
      aria-label="Search forms"
      defaultValue={defaultValue}
      name="q"
      onChange={handleChange}
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input className="w-64" placeholder="Search forms..." />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}
