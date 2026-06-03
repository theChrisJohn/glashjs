// Nested layout -> wraps only pages under /dash, INSIDE the root layout.
export default function DashLayout({ children }) {
  return (
    <section style="border:1px solid #2a2f3a;border-radius:10px;padding:1rem">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.15em;color:#7d818c">Dashboard</div>
      {children}
    </section>
  );
}
