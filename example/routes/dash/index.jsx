// Page under /dash -> rendered inside DashLayout inside RootLayout (nested).
export const title = 'glashjs — dashboard';

export default function DashHome() {
  return (
    <div>
      <h1>Dashboard home</h1>
      <p>This page is wrapped by the dash layout, which is wrapped by the root layout.</p>
    </div>
  );
}
