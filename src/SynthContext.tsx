// SynthContext.tsx
import React, { createContext, useContext } from 'react';
import * as Tone from 'tone';

// Create a context
const SynthContext = createContext<Tone.PolySynth | null>(null);

// Create a provider component
export const SynthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
            type: 'triangle',
        },
    }).toDestination();

    return (
        <SynthContext.Provider value={synth}>
            {children}
        </SynthContext.Provider>
    );
};

// Custom hook to use the SynthContext
export const useSynth = () => {
    const context = useContext(SynthContext);
    if (!context) {
        throw new Error("useSynth must be used within a SynthProvider");
    }
    return context;
};