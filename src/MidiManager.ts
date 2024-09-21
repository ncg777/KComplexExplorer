// MIDIManager.ts
export class MidiManager {
    private midiAccess: WebMidi.MIDIAccess | null = null;
    private midiOutput: WebMidi.MIDIOutput | null = null;

    async init() {
        if (!navigator.requestMIDIAccess) {
            console.error("Web MIDI API not supported.");
            return;
        }

        this.midiAccess = await navigator.requestMIDIAccess();
        const outputs = Array.from(this.midiAccess.outputs.values());
        if (outputs.length > 0) {
            this.midiOutput = outputs[0]; // Use the first output device
        }
    }

    playChord(chord: number[], octave:number=5) {
        if (this.midiOutput && this.midiOutput != null) {
            const noteOnEvents = chord.map(note => [0x90, note+octave*12, 0x7f]); // Note on, velocity 127
            const noteOffEvents = chord.map(note => [0x80, note+octave*12, 0x00]); // Note off

            noteOnEvents.forEach(event => this.midiOutput != null && this.midiOutput.send(event));
            setTimeout(() => {
                noteOffEvents.forEach(event => this.midiOutput != null && this.midiOutput.send(event));
            }, 1000); // Release notes after 1 second
        } else {
            console.warn("No MIDI output device available.");
        }
    }
}