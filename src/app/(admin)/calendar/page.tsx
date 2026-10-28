import { redirect } from "next/navigation";
import { MONTH_PATTERN } from "@/lib/visits/time";

// The calendar now lives on the Trips page; keep old links working.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  redirect(month && MONTH_PATTERN.test(month) ? `/trips?view=calendar&month=${month}` : "/trips?view=calendar");
}
