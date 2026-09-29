export default function Loading() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">FUEL TRACKER BG</p>
          <h1>Зареждаме <em>данните.</em></h1>
          <p className="lede">Проверяваме последните валидирани наблюдения.</p>
        </div>
        <div className="hero-chip">
          <span>Статус</span>
          <strong>…</strong>
          <small>Моля, изчакай</small>
        </div>
      </section>
    </main>
  );
}
