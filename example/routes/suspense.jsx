import { Suspense } from 'preact/compat';

let data = null;                       // module-global: first SSR request suspends
function Slow() {
  if (data) return <p>SLOW-CONTENT-{data}</p>;
  throw new Promise((res) => setTimeout(() => { data = 'OK'; res(); }, 120));
}

export const title = 'glashjs — suspense';
export default function Page() {
  return (
    <div>
      <h1>Suspense shell</h1>
      <Suspense fallback={<p>LOADING-FALLBACK</p>}><Slow /></Suspense>
    </div>
  );
}
