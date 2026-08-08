import { useMemo, useState } from 'react';
import type { PublicationChrome } from '../viewport.js';
import { demoDisplayMeshes } from './demo-meshes.js';
import { ViewportCanvas } from './ViewportCanvas.js';

export function App() {
  const meshes = useMemo(() => demoDisplayMeshes(), []);
  const [chrome, setChrome] = useState<PublicationChrome>('candidate');
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <main className="spds-app">
      <header className="spds-header">
        <h1>SPDS</h1>
        <p>Semantic parametric design — viewport displays derived geometry only.</p>
        <div className="spds-actions">
          <button type="button" onClick={() => setChrome('candidate')}>
            Candidate
          </button>
          <button type="button" onClick={() => setChrome('published')}>
            Published
          </button>
        </div>
        {selected ? <p className="spds-selected">Semantic pick: {selected}</p> : null}
      </header>
      <ViewportCanvas meshes={meshes} chrome={chrome} onPickSemantic={setSelected} />
    </main>
  );
}
