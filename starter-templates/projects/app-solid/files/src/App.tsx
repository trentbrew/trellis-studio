import "./styles.css"

const records = [
  { label: "Active records", value: "24" },
  { label: "Open tasks", value: "7" },
  { label: "Draft updates", value: "3" },
]

export default function App() {
  return (
    <main class="shell">
      <aside>
        <strong>{{ name }}</strong>
        <nav>
          <a class="active">Overview</a>
          <a>Records</a>
          <a>Content</a>
          <a>Links</a>
        </nav>
      </aside>
      <section class="workspace">
        <header>
          <div>
            <p>Workspace</p>
            <h1>Operational App Starter</h1>
          </div>
          <button>New Record</button>
        </header>
        <div class="metrics">
          {records.map((item) => (
            <article>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
        <section class="table">
          <div class="row head">
            <span>Name</span>
            <span>Status</span>
            <span>Owner</span>
          </div>
          <div class="row">
            <span>Launch checklist</span>
            <span>In progress</span>
            <span>Studio</span>
          </div>
          <div class="row">
            <span>Customer interview notes</span>
            <span>Draft</span>
            <span>Research</span>
          </div>
          <div class="row">
            <span>Pricing copy</span>
            <span>Ready</span>
            <span>Content</span>
          </div>
        </section>
      </section>
    </main>
  )
}
