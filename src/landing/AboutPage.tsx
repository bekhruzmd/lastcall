import './AboutPage.css';

export default function AboutPage() {
  return (
    <main className="about">
      <header className="about__nav">
        <a className="about__brand" href="/" aria-label="Leftover Bulls home">
          Leftover <span>Bulls</span>
        </a>
        <a className="about__action" href="/">Find food</a>
      </header>

      <section className="about__hero">
        <h1>Good food should not become trash.</h1>
        <p className="about__lede">
          Club events leave food behind while many USF students need reliable meal options.
        </p>
      </section>

      <section className="about__problem" aria-labelledby="problem-title">
        <div className="about__problem-copy">
          <h2 id="problem-title">The food exists. The timing misses.</h2>
          <p className="about__stat"><strong>40%</strong> of USF students experience food insecurity.</p>
          <p>
            The <strong>Feed-A-Bull pantry is open Monday–Friday, 10 AM–4 PM</strong>.
            Club meetings and events often finish outside those hours, when nutritious food
            is hardest to reach.
          </p>
        </div>
      </section>

      <section className="about__how" aria-labelledby="how-title">
        <h2 id="how-title">From leftover to a pickup in three steps.</h2>
        <ol className="about__steps">
          <li>
            <h3>Post it</h3>
            <p>A club officer shares what is left, the building, portions, and how long it lasts.</p>
          </li>
          <li>
            <h3>Join the draw</h3>
            <p>Students enter a 45-second lottery, or the 20-second demo window.</p>
          </li>
          <li>
            <h3>Pick it up</h3>
            <p>A signed QR ticket takes the student to the pickup point without a stampede.</p>
          </li>
        </ol>
      </section>

      <section className="about__fair" aria-labelledby="fair-title">
        <div>
          <h2 id="fair-title">Fast hands should not decide who eats.</h2>
        </div>
        <div className="about__fair-copy">
          <p>
            <strong>The lottery gives everyone in the window a chance.</strong> After it closes,
            the available portions are drawn without replacement.
          </p>
          <p>
            Students who have received fewer meals in the last seven days get a higher chance.
            A private priority choice can double that chance for students prioritizing groceries.
            Names and priority choices are never shown on the board.
          </p>
        </div>
      </section>
    </main>
  );
}
