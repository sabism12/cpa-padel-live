import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// The Live Group Draw is its own lazy-loaded chunk: the homepage and every
// existing page keep loading exactly the same code as before.
const DrawApp = lazy(() => import('./draw/DrawApp.tsx'));

const root = createRoot(document.getElementById('root')!);

const isDrawRoute = window.location.pathname.toLowerCase().startsWith('/draw');

root.render(
  <StrictMode>
    {isDrawRoute ? (
      <Suspense
        fallback={
          <div
            className="flex min-h-screen items-center justify-center font-mono text-sm"
            style={{ backgroundColor: '#070A12', color: '#8A97AD' }}
          >
            Loading live draw…
          </div>
        }
      >
        <DrawApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
