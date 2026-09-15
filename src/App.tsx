import React from 'react';
import { useMidnight } from './hooks/useMidnight';
import { WalletConnect } from './components/WalletConnect';
import { CircuitCall } from './components/CircuitCall';

function App() {
  const midnight = useMidnight();

  return (
    <div className="app-container">
      <header className="header">
        <h1>Midnight Counter dApp</h1>
        <p>Increment a public counter without revealing by how much.</p>
      </header>

      <main>
        <WalletConnect midnight={midnight} />
        <CircuitCall midnight={midnight} />
      </main>

      <footer className="footer">
        <p>Built for the Midnight Builder Challenge • Level 2</p>
      </footer>
    </div>
  );
}

export default App;
