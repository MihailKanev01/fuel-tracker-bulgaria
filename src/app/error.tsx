"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">FUEL TRACKER BG · ERROR</p>
          <h1>Нещо се обърка.</h1>
          <p className="lede">Приложението срещна неочаквана грешка. Опитай да заредиш страницата отново.</p>
          <button type="button" onClick={() => reset()}>Опитай отново</button>
        </div>
      </section>
    </main>
  );
}
