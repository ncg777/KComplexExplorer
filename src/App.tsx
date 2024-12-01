// App.tsx
import React, { useEffect, useState } from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import KComplexExplorer from './KComplexExplorer';
import { PCS12 } from './Objects/.';

function App() {
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const initialize = async () => {
            try {
                await PCS12.init(); // Initialize PCS12
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
                <h1>k-Complex explorer</h1>
            </header>
            <main>
                {!isInitialized ? (
                    <div>Loading data, please wait...</div>
                ) : (
                    <KComplexExplorer scale="12-1.00" />
                )}
            </main>
        </div>
    );
}
export default App;