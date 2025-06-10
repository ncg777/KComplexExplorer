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
- **Installable PWA:** KComplexExplorer is a Progressive Web App—install it as an app on your computer, phone, or tablet for offline use and a native experience.
- **PCS12 Class Powered (from [ultra-mega-enumerator](https://github.com/ncg777/ultra-mega-enumerator)):**
  - Efficient identification, transposition, and rotation of sets.
  - Calculation of Forte numbers, common names, and interval vectors.
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

## Dependencies

- [ultra-mega-enumerator](https://github.com/ncg777/ultra-mega-enumerator) (provides PCS12 and core enumeration logic)

## References

- Forte, Allen. *The Structure of Atonal Music*. Yale University Press, 1973.
- [Music Theory Online Resources](https://musictheory.net/)

## License

MIT License