"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

export function HeroUISmokeTest() {
  const [count, setCount] = useState(0);

  return (
    <Button variant="tertiary" onPress={() => setCount((c) => c + 1)}>
      Client component clicked {count} times
    </Button>
  );
}
