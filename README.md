# KComplexExplorer

**KComplexExplorer** is a Progressive Web App (PWA) for advanced exploration, enumeration, and analysis of musical **Pitch-Class Sets (PCS)** within the 12-tone equal temperament system. It is designed for music theorists, composers, and researchers interested in the structure and relationships of pitch-class sets.

**Try it online:**  
[https://ncg777.github.io/KComplexExplorer/](https://ncg777.github.io/KComplexExplorer/)

## Features

- **Pitch-Class Set (PCS) Analysis:** Analyze all possible pitch-class sets (PCS) of cardinalities 1–12.  
  > *A Pitch-Class Set (PCS) is a collection of distinct pitch classes (modulo 12), fundamental to post-tonal music theory.*
- **Forte Number & Common Name Lookup:** Identify each set by its Forte number and standard musical name.
- **Subset and Superset Display:** Select any set from the left-side list to instantly display all its subsets and supersets for intuitive exploration of set relationships.
- **Playback Options:** Audition the notes of any set upwards, downwards, or simultaneously using the popup buttons.
- **Sentiment Tracking:** Mark each pitch-class set as liked (+1), neutral (0), or disliked (-1) directly from its popup.
- **CSV Export for ML Workflows:** Export the full catalog of pitch-class sets, their analysis metadata, and saved sentiments to CSV.
- **Installable PWA:** KComplexExplorer is a Progressive Web App—install it as an app on your computer, phone, or tablet for offline use and a native experience.
- **PCS12 Class Powered (from [ultra-mega-enumerator](https://github.com/ncg777/ultra-mega-enumerator)):**
  - Efficient identification, transposition, and rotation of sets.
  - Calculation of Forte numbers, common names, interval vectors, and interval-vector entropy (low/mid/high percentile bands grouped by set cardinality).
  - Set operations: intersection, union, difference, and analysis of symmetries and potential tonal centers.
- **Fast Enumeration:** Uses efficient combinatorial algorithms for exhaustive, duplicate-free set exploration.
- **Extensible Foundation:** Built to connect with other music-theoretic and computational tools.

## How It Works

- **Pitch-Class Set (PCS):** A collection of distinct pitch classes (modulo 12), fundamental to post-tonal music theory.
- **Set Relationships:** Instantly view and navigate all subsets and supersets of any selected set for deep structural insight.
- **Playback:** Audition sets with upward, downward, or simultaneous playback—ideal for both analysis and inspiration.
- **Intuitive GUI:** Interactively explore, select, and analyze sets through a responsive graphical interface.

## Installation & Usage

You don’t need to install anything to use KComplexExplorer—simply open [https://ncg777.github.io/KComplexExplorer/](https://ncg777.github.io/KComplexExplorer/) in your browser.

**To install as an app:**  
Most browsers (e.g., Chrome, Edge, Safari) allow you to install KComplexExplorer as a native app on your device via the browser’s menu (look for “Install App” or “Add to Home Screen”).

### Developer Setup

1. **Clone this repository:**
   ```bash
   git clone https://github.com/ncg777/KComplexExplorer.git
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **(Optional) Clone ultra-mega-enumerator for core PCS logic:**
   ```bash
   git clone https://github.com/ncg777/ultra-mega-enumerator.git
   ```

## CLI

A command-line interface is available in the `cli/` directory, providing all PWA functionalities (except MIDI playback) from the terminal.

### Setup

```bash
cd cli
npm install
npm run build
```

### Commands

```bash
# Analyze a pitch-class set by Forte number
node dist/cli.js analyze 3-11A
node dist/cli.js analyze 7-35.00

# Identify a PCS from pitch classes (0=C, 1=C#, ..., 11=B)
node dist/cli.js identify 0,4,7

# List all PCS (optionally filtered)
node dist/cli.js list --upper-bound 7-35 --search major

# Get subsets/supersets
node dist/cli.js subsets 7-35
node dist/cli.js supersets 3-11A --within 7-35

# Set operations
node dist/cli.js union 3-11A 3-11B
node dist/cli.js intersection 7-35 7-34

# Z-relations
node dist/cli.js z-relations 6-z29

# Transpose
node dist/cli.js transpose 3-11A 5

# JSON output
node dist/cli.js analyze 3-11A --json
```

> **Note:** Forte numbers can be specified with or without the rotation suffix (e.g., both `3-11A` and `3-11A.00` work; omitting the suffix defaults to `.00`).

## MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server is included, allowing LLM agents to access all pitch-class set analysis functionalities as tools.

### Setup

```bash
cd cli
npm install
npm run build
```

### Running

```bash
node dist/mcp-server.js
```

The server communicates over **stdio** using JSON-RPC, as per the MCP specification.

### MCP Configuration

To connect the server to an MCP-compatible client (e.g., Claude Desktop, Cursor), add this to your MCP client configuration:

```json
{
  "mcpServers": {
    "kcomplex-explorer": {
      "command": "node",
      "args": ["/absolute/path/to/KComplexExplorer/cli/dist/mcp-server.js"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `analyze` | Analyze a PCS by its Forte number |
| `identify` | Identify a PCS from pitch classes (0–11) |
| `list_pcs` | List/search all pitch-class sets |
| `get_subsets` | Get all subsets of a PCS |
| `get_supersets` | Get all supersets of a PCS |
| `union` | Compute the union of multiple PCS |
| `intersection` | Compute the intersection of multiple PCS |
| `z_relations` | Find Z-related chords (same interval vector) |
| `transpose` | Transpose a PCS by semitones |

## Dependencies

- [ultra-mega-enumerator](https://github.com/ncg777/ultra-mega-enumerator) (provides PCS12 and core enumeration logic)

## References

- Forte, Allen. *The Structure of Atonal Music*. Yale University Press, 1973.
- [Music Theory Online Resources](https://musictheory.net/)

## License

MIT License
