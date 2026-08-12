import { Button } from "@heroui/react";
import { HeroUISmokeTest } from "@/components/ui/heroui-smoke-test";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Jaipur Rugs Foundation — Forms</h1>
      <p className="text-sm text-zinc-500">Scaffold smoke test: HeroUI v3 from a Server Component and a Client Component.</p>
      <Button variant="tertiary">Server component button</Button>
      <HeroUISmokeTest />
    </div>
  );
}
