import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { PCS12 } from 'ultra-mega-enumerator';
import * as Tone from 'tone';
import { useSynth } from './SynthContext';
import {
    formatPolynomial, generatePolynomialScale, PITCH_CLASS_NAMES, POLYNOMIAL_PRESETS, randomPolynomialScale,
} from './polynomialScales';
import './PolynomialScaleGenerator.css';

interface PolynomialScaleGeneratorProps {
    show: boolean;
    onHide: () => void;
    onExplore: (chord: PCS12) => void;
}

const termLabels = ['Constant', 'x', 'x²', 'x³', 'x⁴', 'x⁵', 'x⁶'];

function clockPoint(pc: number, radius: number): { x: number; y: number } {
    const angle = (pc * Math.PI) / 6 - Math.PI / 2;
    return { x: 180 + Math.cos(angle) * radius, y: 180 + Math.sin(angle) * radius };
}

const PolynomialScaleGenerator: React.FC<PolynomialScaleGeneratorProps> = ({ show, onHide, onExplore }) => {
    const [degree, setDegree] = useState(1);
    const [drafts, setDrafts] = useState(['5', '7', '0', '0', '0', '0', '0']);
    const [count, setCount] = useState(7);
    const [requirePermutation, setRequirePermutation] = useState(false);
    const [playback, setPlayback] = useState<'order' | 'scale' | null>(null);
    const [activePitch, setActivePitch] = useState<number | null>(null);
    const [audioError, setAudioError] = useState('');
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const playbackToken = useRef(0);
    const synth = useSynth();
    const gradientId = `polynomial-path-${useId().replace(/:/g, '')}`;

    const activeDrafts = drafts.slice(0, degree + 1);
    const coefficientsValid = activeDrafts.every(value => /^[-+]?\d+$/.test(value) && Number.isSafeInteger(Number(value)));
    const coefficientKey = activeDrafts.join(',');
    const result = useMemo(() => coefficientsValid
        ? generatePolynomialScale(coefficientKey.split(',').map(Number), count)
        : null, [coefficientsValid, coefficientKey, count]);
    const chord = useMemo(() => result
        ? PCS12.identify(PCS12.createWithSizeAndSet(12, new Set(result.pitchClasses)))
        : null, [result]);
    const canExplore = Boolean(result?.isDistinctPrefix && (!requirePermutation || result.isPermutation));
    const formula = coefficientsValid ? formatPolynomial(activeDrafts.map(Number)) : '…';
    const matchingPreset = POLYNOMIAL_PRESETS.find(preset => preset.count === count
        && preset.coefficients.length === degree + 1
        && preset.coefficients.every((coefficient, index) => String(coefficient) === drafts[index]));

    const stopPlayback = () => {
        playbackToken.current += 1;
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setPlayback(null);
        setActivePitch(null);
    };

    useEffect(() => {
        stopPlayback();
        setAudioError('');
        return () => {
            playbackToken.current += 1;
            timers.current.forEach(clearTimeout);
            timers.current = [];
        };
    }, [coefficientKey, count, show]);

    const play = async (mode: 'order' | 'scale') => {
        stopPlayback();
        if (!result) return;
        const token = playbackToken.current;
        setAudioError('');
        try {
            await Tone.start();
            if (playbackToken.current !== token) return;
            const notes = mode === 'order' ? result.prefix : result.pitchClasses;
            setPlayback(mode);
            notes.forEach((pc, index) => {
                timers.current.push(setTimeout(() => {
                    try {
                        synth.triggerAttackRelease(Tone.Frequency(pc + 60, 'midi').toNote(), 0.24, Tone.now());
                        setActivePitch(pc);
                    } catch {
                        stopPlayback();
                        setAudioError('Audio could not start. Try playing again.');
                    }
                }, index * 300));
            });
            timers.current.push(setTimeout(stopPlayback, notes.length * 300));
        } catch {
            setAudioError('Audio could not start. Try playing again.');
        }
    };

    const loadPreset = (preset: typeof POLYNOMIAL_PRESETS[number]) => {
        setDegree(preset.coefficients.length - 1);
        setDrafts(Array.from({ length: 7 }, (_, index) => String(preset.coefficients[index] ?? 0)));
        setCount(preset.count);
        setRequirePermutation(false);
    };

    const surprise = () => {
        const coefficients = randomPolynomialScale(degree, count, requirePermutation);
        setDrafts(Array.from({ length: 7 }, (_, index) => String(coefficients[index] ?? 0)));
    };

    return (
        <Modal show={show} onHide={onHide} size="xl" centered scrollable className="polynomial-modal" aria-labelledby="polynomial-lab-title">
            <Modal.Header closeButton closeVariant="white">
                <div>
                    <span className="poly-eyebrow">PATTERNS INTO PITCHES</span>
                    <Modal.Title id="polynomial-lab-title">Polynomial scale lab<span className="poly-mod-badge">mod 12</span></Modal.Title>
                    <p className="poly-subtitle">Choose a rule. Follow its path. Find your next scale.</p>
                </div>
            </Modal.Header>
            <Modal.Body>
                <div className="poly-presets" aria-label="Scale presets">
                    {POLYNOMIAL_PRESETS.map(preset => (
                        <button type="button" key={preset.id} className={`poly-preset ${matchingPreset?.id === preset.id ? 'is-selected' : ''}`}
                            aria-pressed={matchingPreset?.id === preset.id} onClick={() => loadPreset(preset)}>
                            <span>{preset.name}</span><small>{preset.caption}</small>
                        </button>
                    ))}
                </div>

                <div className="poly-workspace">
                    <div className="poly-controls">
                        <div className="poly-section-heading"><span className="poly-step">01</span><h3>Shape the rule</h3></div>
                        <div className="poly-formula" aria-label={`P of x equals ${formula} modulo 12`}>
                            <span>P(x) =</span><strong>{formula}</strong><small>mod 12</small>
                        </div>
                        <div className="poly-degree-row">
                            <label htmlFor="poly-degree">Polynomial degree</label>
                            <select id="poly-degree" value={degree} onChange={event => setDegree(Number(event.target.value))}>
                                {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}{value === 1 ? ' · Linear' : value === 2 ? ' · Quadratic' : value === 3 ? ' · Cubic' : ''}</option>)}
                            </select>
                        </div>
                        <div className="poly-coefficients">
                            {activeDrafts.map((value, power) => (
                                <label key={power} className="poly-coefficient" htmlFor={`poly-coefficient-${power}`}>
                                    <span>{termLabels[power]}</span>
                                    <input id={`poly-coefficient-${power}`} type="number" step="1" value={value}
                                        aria-label={power === 0 ? 'Constant coefficient' : `Coefficient of ${termLabels[power]}`}
                                        aria-invalid={!/^[-+]?\d+$/.test(value) || !Number.isSafeInteger(Number(value))}
                                        onChange={event => setDrafts(previous => previous.map((draft, index) => index === power ? event.target.value : draft))} />
                                </label>
                            ))}
                        </div>
                        <p className="poly-hint">Integer coefficients, including negatives. Outputs wrap around the twelve pitch classes.</p>

                        <div className="poly-section-heading poly-count-heading"><span className="poly-step">02</span><h3>Take the first notes</h3><output htmlFor="poly-count">k = {count}</output></div>
                        <label className="poly-sr-only" htmlFor="poly-count">Number of outputs</label>
                        <input className="poly-range" id="poly-count" type="range" min="1" max="12" value={count}
                            style={{ '--range-progress': `${((count - 1) / 11) * 100}%` } as React.CSSProperties}
                            onChange={event => setCount(Number(event.target.value))} />
                        <div className="poly-range-labels"><span>1 note</span><span>12 notes</span></div>

                        <fieldset className="poly-mode">
                            <legend>Selection rule</legend>
                            <div className="poly-segmented">
                                <button type="button" aria-pressed={!requirePermutation} className={!requirePermutation ? 'is-selected' : ''} onClick={() => setRequirePermutation(false)}>Distinct prefix</button>
                                <button type="button" aria-pressed={requirePermutation} className={requirePermutation ? 'is-selected' : ''} onClick={() => setRequirePermutation(true)}>Full permutation</button>
                            </div>
                            <p className="poly-hint">{requirePermutation ? 'All twelve outputs must be distinct, even beyond your selection.' : 'Only the first k outputs must be distinct. Later repeats are allowed.'}</p>
                        </fieldset>
                        <button type="button" className="poly-button poly-surprise" onClick={surprise}><span aria-hidden="true">⤨</span> Surprise me<span className="poly-surprise-caption">a valid rule for this k</span></button>
                    </div>

                    <div className="poly-preview">
                        <div className="poly-preview-heading"><span className="poly-eyebrow">THE PITCH-CLASS PATH</span><span className={`poly-status ${canExplore ? 'is-valid' : 'is-warning'}`}>{!result ? 'Check coefficients' : canExplore ? 'Ready to explore' : 'Rule not satisfied'}</span></div>
                        <svg className="poly-clock" viewBox="0 0 360 360" role="img" aria-labelledby={`${gradientId}-title ${gradientId}-description`}>
                            <title id={`${gradientId}-title`}>Pitch-class clock</title>
                            <desc id={`${gradientId}-description`}>{result ? `First ${count} outputs: ${result.prefix.map(pc => PITCH_CLASS_NAMES[pc]).join(', ')}. ${result.pitchClasses.length} distinct pitch classes.` : 'Enter integer coefficients to see the generated scale.'}</desc>
                            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a99bff" /><stop offset="1" stopColor="#55dfd0" /></linearGradient></defs>
                            <circle cx="180" cy="180" r="119" className="poly-clock-orbit" />
                            <circle cx="180" cy="180" r="90" className="poly-clock-guide" />
                            {Array.from({ length: 12 }, (_, pc) => {
                                const from = clockPoint(pc, 102);
                                const to = clockPoint(pc, 108);
                                return <line key={pc} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="poly-clock-tick" />;
                            })}
                            {result && <polyline points={result.prefix.map(pc => { const point = clockPoint(pc, 119); return `${point.x},${point.y}`; }).join(' ')} fill="none" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinejoin="round" opacity="0.65" />}
                            <circle cx="180" cy="180" r="49" className="poly-clock-center" />
                            <text x="180" y="183" className="poly-clock-count">{result?.pitchClasses.length ?? '–'}</text>
                            <text x="180" y="204" className="poly-clock-caption">{result?.pitchClasses.length === 1 ? 'distinct tone' : 'distinct tones'}</text>
                            {Array.from({ length: 12 }, (_, pc) => {
                                const point = clockPoint(pc, 119);
                                const label = clockPoint(pc, 153);
                                const selected = result?.pitchClasses.includes(pc);
                                const repeated = result ? result.prefix.filter(note => note === pc).length > 1 : false;
                                return <g key={pc} className={`poly-clock-note ${selected ? 'is-selected' : ''} ${repeated ? 'is-repeated' : ''} ${activePitch === pc ? 'is-playing' : ''}`}>
                                    {activePitch === pc && <circle cx={point.x} cy={point.y} r="20" className="poly-note-halo" />}
                                    <circle cx={point.x} cy={point.y} r={selected ? 12 : 7} />
                                    {selected && <text x={point.x} y={point.y + 4} className="poly-node-number">{pc}</text>}
                                    <text x={label.x} y={label.y + 1} className="poly-note-name">{PITCH_CLASS_NAMES[pc]}</text>
                                    <text x={label.x} y={label.y + 16} className="poly-note-number">{pc}</text>
                                </g>;
                            })}
                        </svg>
                        <div className="poly-result" aria-live="polite" aria-atomic="true">
                            <div className="poly-result-title"><span className="poly-eyebrow">YOUR SCALE · ASCENDING</span><span>{chord?.toString() ?? '—'}</span></div>
                            <div className="poly-result-notes">{result ? result.pitchClasses.map(pc => <span key={pc} className={activePitch === pc ? 'is-playing' : ''}>{PITCH_CLASS_NAMES[pc]}</span>) : <span className="poly-empty">Enter whole-number coefficients</span>}</div>
                            <p className="poly-common-name">{chord?.getCommonName() || (result ? 'An unnamed pitch-class collection. Make it your own.' : 'Your scale will appear here.')}</p>
                            <div className="poly-intervals"><span>Cyclic steps</span><strong>{result?.steps.join(' · ') ?? '—'}</strong><small>semitones</small></div>
                        </div>
                    </div>
                </div>

                <section className="poly-sequence" aria-labelledby="poly-sequence-title">
                    <div className="poly-sequence-heading"><div className="poly-section-heading"><span className="poly-step">03</span><h3 id="poly-sequence-title">Follow the sequence</h3></div><span>Highlighted = first {count} outputs</span></div>
                    <ol className="poly-sequence-grid">
                        {Array.from({ length: 12 }, (_, index) => {
                            const pc = result?.sequence[index];
                            const repeated = result && pc !== undefined && result.sequence.indexOf(pc) < index;
                            return <li key={index} className={`${index < count ? 'is-included' : ''} ${repeated ? 'is-repeated' : ''} ${pc !== undefined && activePitch === pc && index < count ? 'is-playing' : ''}`}>
                                <small>x = {index}</small><strong>{pc === undefined ? '—' : PITCH_CLASS_NAMES[pc]}</strong><span>{pc === undefined ? '—' : pc}{repeated ? ' ↺' : ''}</span>
                            </li>;
                        })}
                    </ol>
                    <div className={`poly-feedback ${!canExplore ? 'is-warning' : ''}`} role="status">
                        {!result ? 'Use a whole number in every coefficient field.'
                            : !result.isDistinctPrefix ? `The first ${count} outputs contain ${result.pitchClasses.length} distinct pitches. Lower k or change the rule to remove repeats.`
                            : requirePermutation && !result.isPermutation ? `This prefix is distinct, but the full sequence repeats at x = ${result.firstRepeatIndex}. Choose Distinct prefix to use this scale.`
                            : result.isPermutation ? `All 12 outputs are distinct. This rule is equivalent to ${formatPolynomial([result.affineEquivalent!.offset, result.affineEquivalent!.multiplier])} modulo 12.`
                            : `The first ${count} outputs are distinct. The full sequence first repeats at x = ${result.firstRepeatIndex}; later repeats are allowed.`}
                    </div>
                </section>

                <div className="poly-playback">
                    <button type="button" className="poly-button" disabled={!result} onClick={() => playback === 'order' ? stopPlayback() : void play('order')}><span aria-hidden="true">{playback === 'order' ? '■' : '▶'}</span> {playback === 'order' ? 'Stop sequence' : 'Play generation order'}</button>
                    <button type="button" className="poly-button" disabled={!result} onClick={() => playback === 'scale' ? stopPlayback() : void play('scale')}><span aria-hidden="true">{playback === 'scale' ? '■' : '▶'}</span> {playback === 'scale' ? 'Stop scale' : 'Play ascending scale'}</button>
                    <span className="poly-playback-note">{audioError || 'Two ways to hear the same collection.'}</span>
                </div>
                <details className="poly-theory"><summary>Why higher degrees sometimes sound familiar</summary><p>Every integer-coefficient polynomial that permutes all twelve pitch classes has the same outputs as a linear rule ax + b, with a = 1, 5, 7, or 11. Higher degrees can reveal other scales when only the selected prefix must be distinct. The scale is a collection of pitches; choosing a tonic gives it a mode.</p></details>
            </Modal.Body>
            <Modal.Footer><p>Explore this collection and all of its subsets.</p><button type="button" className="poly-button" onClick={onHide}>Close</button><button type="button" className="poly-button poly-primary" disabled={!canExplore || !chord} onClick={() => { if (canExplore && chord) onExplore(chord); }}>Use as upper bound <span aria-hidden="true">→</span></button></Modal.Footer>
        </Modal>
    );
};

export default PolynomialScaleGenerator;
