import "./styles.css"

export default function App() {
  return (
    <main class="page">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Trellis Website</p>
          <h1>{{ name }}</h1>
          <p class="lede">A content-aware site starter with CMS pages, posts, notes, and media ready in Studio.</p>
          <div class="actions">
            <a href="#content">View Content</a>
            <a href="#media">Media Library</a>
          </div>
        </div>
      </section>
      <section id="content" class="band">
        <article>
          <span>01</span>
          <h2>Structured Pages</h2>
          <p>Model landing sections and reusable content blocks in the Content projection.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Publishing Flow</h2>
          <p>Draft updates as posts or pages, then let the agent wire them into the UI.</p>
        </article>
        <article id="media">
          <span>03</span>
          <h2>Media Ready</h2>
          <p>Use image and video assets as first-class project context.</p>
        </article>
      </section>
    </main>
  )
}
