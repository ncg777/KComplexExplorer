#!/usr/bin/env node
import {
  ensureInitialized,
  analyze,
  identify,
  listPCS,
  getSubsets,
  getSupersets,
  union,
  intersection,
  zRelations,
  computePolychordMasks,
  transpose,
  sortChords,
  formatAnalysis,
} from './pcs12-operations.js';

function printUsage(): void {
  console.log(`
KComplexExplorer CLI - Pitch-Class Set analysis tools

Usage: kcomplex <command> [options]

Commands:
  analyze <forte>
      Analyze a pitch-class set by its Forte number.
      Example: kcomplex analyze 3-11A

  identify <pitch_classes>
      Identify a pitch-class set from comma-separated pitch classes (0-11).
      Example: kcomplex identify 0,4,7

  list [--upper-bound <forte>] [--search <query>]
      List all pitch-class sets, optionally filtered.
      Example: kcomplex list --upper-bound 7-35 --search major

  subsets <forte> [--within <scale_forte>]
      Get all subsets of a pitch-class set.
      Example: kcomplex subsets 7-35

  supersets <forte> [--within <scale_forte>]
      Get all supersets of a pitch-class set.
      Example: kcomplex supersets 3-11A

  union <forte1> <forte2> [<forte3> ...]
      Compute the union of multiple pitch-class sets.
      Example: kcomplex union 3-11A 3-11B

  intersection <forte1> <forte2> [<forte3> ...]
      Compute the intersection of multiple pitch-class sets.
      Example: kcomplex intersection 7-35 7-34

  z-relations <forte>
      Find Z-related chords (same interval vector, different content).
      Example: kcomplex z-relations 6-z29

  transpose <forte> <semitones>
      Transpose a pitch-class set by a number of semitones.
      Example: kcomplex transpose 3-11A 5

  sort-chords <forte1> <forte2> [<forte3> ...] [--rotate <n>]
      Sort pitch-class sets using rotatedCompareTo with the given rotation.
      Example: kcomplex sort-chords 3-11A 3-11B 3-4 --rotate 3

Options:
  --help, -h    Show this help message
  --json        Output results as JSON
`);
}

function parseArgs(args: string[]): { command: string; positional: string[]; flags: Record<string, string | boolean> } {
  const command = args[0] ?? '';
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg === '-h') {
      flags['help'] = true;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function output(data: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else if (Array.isArray(data)) {
    for (const item of data) {
      console.log(formatAnalysis(item));
      console.log('---');
    }
    console.log(`Total: ${data.length} results`);
  } else {
    console.log(formatAnalysis(data as any));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const { command, positional, flags } = parseArgs(args);
  const asJson = flags['json'] === true;

  await ensureInitialized();

  switch (command) {
    case 'analyze': {
      if (positional.length < 1) {
        console.error('Error: analyze requires a Forte number argument.');
        process.exit(1);
      }
      const result = analyze(positional[0]);
      output(result, asJson);
      break;
    }

    case 'identify': {
      if (positional.length < 1) {
        console.error('Error: identify requires comma-separated pitch classes.');
        process.exit(1);
      }
      const pitchClasses = positional[0].split(',').map(s => parseInt(s.trim(), 10));
      const result = identify(pitchClasses);
      output(result, asJson);
      break;
    }

    case 'list': {
      const upperBound = flags['upper-bound'] as string | undefined;
      const search = flags['search'] as string | undefined;
      const results = listPCS({
        upperBound: typeof upperBound === 'string' ? upperBound : undefined,
        search: typeof search === 'string' ? search : undefined,
      });
      output(results, asJson);
      break;
    }

    case 'subsets': {
      if (positional.length < 1) {
        console.error('Error: subsets requires a Forte number argument.');
        process.exit(1);
      }
      const within = flags['within'] as string | undefined;
      const results = getSubsets(positional[0], typeof within === 'string' ? within : undefined);
      output(results, asJson);
      break;
    }

    case 'supersets': {
      if (positional.length < 1) {
        console.error('Error: supersets requires a Forte number argument.');
        process.exit(1);
      }
      const within = flags['within'] as string | undefined;
      const results = getSupersets(positional[0], typeof within === 'string' ? within : undefined);
      output(results, asJson);
      break;
    }

    case 'union': {
      if (positional.length < 2) {
        console.error('Error: union requires at least 2 Forte numbers.');
        process.exit(1);
      }
      const result = union(positional);
      output(result, asJson);
      break;
    }

    case 'intersection': {
      if (positional.length < 2) {
        console.error('Error: intersection requires at least 2 Forte numbers.');
        process.exit(1);
      }
      const result = intersection(positional);
      output(result, asJson);
      break;
    }

    case 'z-relations': {
      if (positional.length < 1) {
        console.error('Error: z-relations requires a Forte number argument.');
        process.exit(1);
      }
      const result = zRelations(positional[0]);
      if (asJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('Source chord:');
        console.log(formatAnalysis(result.chord));
        console.log('');
        if (result.zMates.length === 0) {
          console.log('No Z-related chords found.');
        } else {
          console.log(`Z-related chords (${result.zMates.length}):`);
          for (const mate of result.zMates) {
            console.log('---');
            console.log(formatAnalysis(mate));
          }
        }
      }
      break;
    }

    case 'transpose': {
      if (positional.length < 2) {
        console.error('Error: transpose requires a Forte number and semitone count.');
        process.exit(1);
      }
      const semitones = parseInt(positional[1], 10);
      if (isNaN(semitones)) {
        console.error('Error: semitones must be a number.');
        process.exit(1);
      }
      const result = transpose(positional[0], semitones);
      output(result, asJson);
      break;
    }

    case 'polychord': {
      if (positional.length < 2) {
        console.error('Error: polychord requires a scale Forte and a comma-separated chords string (quote it).');
        process.exit(1);
      }
      const scale = positional[0];
      const chordsText = positional.slice(1).join(' ');
      try {
        const results = computePolychordMasks(scale, chordsText);
        if (asJson) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(results.join(' '));
        }
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'sort-chords': {
      if (positional.length < 1) {
        console.error('Error: sort-chords requires at least one Forte number.');
        process.exit(1);
      }
      const rotateRaw = flags['rotate'];
      const rotate = typeof rotateRaw === 'string' ? parseInt(rotateRaw, 10) : 0;
      if (isNaN(rotate)) {
        console.error('Error: --rotate must be a number.');
        process.exit(1);
      }
      const results = sortChords(positional, rotate);
      output(results, asJson);
      break;
    }

    default:
      console.error(`Unknown command: "${command}". Run kcomplex --help for usage.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
