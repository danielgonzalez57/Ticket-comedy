"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export function QuerySelect({
  param,
  placeholder,
  options,
  className,
}: {
  param: string;
  placeholder: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? ALL;

  function update(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === ALL) params.delete(param);
    else params.set(param, next);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const items = [{ value: ALL, label: placeholder }, ...options];

  return (
    <Select items={items} value={current} onValueChange={update}>
      <SelectTrigger className={className ?? "w-full sm:w-48"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
