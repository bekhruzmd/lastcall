import { Link } from 'react-router-dom';
import './AboutPage.css';

export default function AboutPage() {
  return (
    <main id="main-content" className="about">
      <header className="about__nav">
        <Link className="about__brand" to="/" aria-label="lastcall home">
          lastcall
        </Link>
        <div className="about__nav-links">
          <Link className="about__nav-link" to="/board">Impact board</Link>
          <Link className="about__nav-link" to="/post">Post leftovers</Link>
          <Link className="about__action" to="/">Find food</Link>
        </div>
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
            A private priority choice doubles the draw weight for students prioritizing groceries.
            The board shows first names for pickups, but never priority choices.
          </p>
        </div>
      </section>

      <section className="about__cta" aria-labelledby="cta-title">
        <div className="about__cta-card">
          <h2 id="cta-title">Get involved on campus</h2>
          <p>
            Whether you are a student looking for a good meal or a student organization with leftover catering,
            lastcall makes campus food recovery fast, fair, and safe.
          </p>
          <div className="about__cta-actions">
            <Link to="/" className="about__action">Find food now</Link>
            <Link to="/post" className="about__action-outline">Post leftovers (Organizers)</Link>
            <Link to="/board" className="about__action-link">View live impact board →</Link>
          </div>
        </div>
      </section>

      <footer className="about__footer">
        <div className="about__footer-inner">
          <p>
            Need ongoing groceries? USF Feed-A-Bull Pantry is located in <strong>MSC 0002</strong>, open Mon–Fri 10 AM – 4 PM.
          </p>
          <p className="about__footer-copy">
            lastcall · Built for the University of South Florida community
          </p>
        </div>
      </footer>
    </main>
  );
}
