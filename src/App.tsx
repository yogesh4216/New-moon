import React from 'react';
import { useMidnight } from './hooks/useMidnight';
import { WalletConnect } from './components/WalletConnect';
import { CircuitCall } from './components/CircuitCall';

function App() {
  const midnightState = useMidnight();

  return (
    <div className="app-container">
      <header className="header">
        <h1>Midnight Counter dApp</h1>
        <p>A zero-knowledge ticketing and voting prototype</p>
      </header>

      <main>
        <WalletConnect midnight={midnightState} />
        
        {/* We always show the circuit call component, but it's disabled if not connected */}
        <CircuitCall midnight={midnightState} />
      </main>

      <footer style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        <p>Built for the Midnight Builder Challenge • Level 2</p>
      </footer>
    </div>
  );
}

export default App;
