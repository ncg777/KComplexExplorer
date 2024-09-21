// App.tsx
import React, { useEffect, useState } from 'react';
import './App.css';
import KComplexExplorer from './KComplexExplorer';
import { MidiManager } from './MidiManager'; // Make sure to adjust the import path if necessary
import { PCS12 } from './Objects/.';

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [midiManager, setMidiManager] = useState<MidiManager | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        await PCS12.init(); // Initialize PCS12
        const manager = new MidiManager(); // Create a MIDI Manager instance
        await manager.init(); // Initialize MIDI Manager
        setMidiManager(manager); // Set the MIDIManager instance into state
        setIsInitialized(PCS12.isInitialized()); // Update initialization state
      } catch (error) {
        console.error("Error during initialization:", error);
      }
    };

    initialize();
  }, []); // Run once on mount

  return (
    <div className="App">
      <header className="App-header">
        <h1>k-Complex Explorer</h1>
      </header>
      <main>
        {!isInitialized ? (
          <div>Loading data, please wait...</div> // Display loading message
        ) : (
          midiManager && <KComplexExplorer scale="8-23.11" midiManager={midiManager} /> 
          // Render component only if initialized and MIDIManager exists
        )}
      </main>
    </div>
  );
}
export default App;