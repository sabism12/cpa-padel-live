import React, { useEffect, useState } from 'react';
import { DrawViewer } from './DrawViewer';
import { DrawAdmin } from './DrawAdmin';

/**
 * Entry point for the Live Group Draw. Rendered as its own lazy-loaded chunk
 * (see src/main.tsx) so the draw code never loads on the main website.
 */
export default function DrawApp() {
  const [path, setPath] = useState(() => window.location.pathname.toLowerCase());

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname.toLowerCase());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const isAdmin = path.startsWith('/draw/admin');
  return isAdmin ? <DrawAdmin /> : <DrawViewer />;
}
