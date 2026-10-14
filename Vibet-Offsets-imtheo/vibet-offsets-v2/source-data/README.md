# source-data/

Drop your generated offset files here, organized by category folder.
The folder name determines how files are labeled on the site:

| Folder name contains | Tagged as  | Color on site |
|----------------------|------------|---------------|
| `external` or `ext`  | External   | Blue          |
| `internal` or `int`  | Internal   | Purple        |
| Anything else        | Misc       | Grey          |

## Example layout

```
source-data/
  External Offsets/
    Offsets.hpp       ← C++ external offsets
    Offsets.cs        ← C# external offsets
    Offsets.json      ← JSON external offsets
    Offsets.txt       ← plain text external offsets
  Internal Offsets/
    Offsets.hpp       ← C++ internal offsets
    Offsets.cs        ← C# internal offsets
  FFlags/
    FFlags.json
  Misc/
    Types.json
```

## Supported offset file formats

The site can parse and browse offsets from these file types:

| Extension | Parsed patterns |
|-----------|-----------------|
| `.hpp` / `.h` / `.cpp` | `constexpr`, `#define`, `const`, `uintptr_t`, hex literals |
| `.cs` | `const`, `static readonly`, hex literals |
| `.json` | flat `{ name: value }` or `{ name: { value: ... } }` |
| `.txt` | `NAME = 0xVALUE` lines |
| `.lua` | `local NAME = 0xVALUE` lines |

## Running the publisher

```bash
python scripts/publish.py
```

Output goes to `public/downloads/` and `public/manifest.json`.
Commit both, then Vercel deploys automatically.
