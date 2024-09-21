import React, { useEffect, useState } from 'react';
import './App.css';
import KComplexExplorer from './KComplexExplorer'; // Adjust the path if necessary
import { PCS12 } from './Objects';



function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    console.log("Initializing PCS12...");
    const initialize = async () => {
        try {
            await PCS12.init();
            setIsInitialized(PCS12.isInitialized());
        } catch (error) {
            console.error("Error during PCS12 initialization:", error);
        }
    };

    initialize();
}, []);

console.log("isInitialized:", isInitialized); // Log state before rendering

  return (
    <div className="App">
      <header className="App-header">
        <h1>k-Complex Explorer</h1>
      </header>
      <main>
        {!isInitialized ? (
          <div>Loading data, please wait...</div> // Display loading message
        ) : (
          <KComplexExplorer scale="8-23.11" /> // Render component only if initialized
        )}
      </main>
    </div>
  );
}
export default App;