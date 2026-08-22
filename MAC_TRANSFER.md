# FarrierOS Mac Transfer

This project is a local-first React + TypeScript + Vite prototype.

## What Transfers

- App source code
- Planning documents
- Sample data in `src/sampleData.ts`
- PWA files
- Build configuration
- Lockfile

Browser-local demo changes made inside the HP browser are stored in that browser's local storage under `farrieros-prototype-0`. Those are not automatically included in the project zip.

## Open On Mac

1. Install Node.js LTS from `https://nodejs.org`.
2. Unzip the project.
3. Open Terminal.
4. Go into the unzipped folder.
5. Run:

```bash
npm install
npm run dev -- --host 0.0.0.0
```

6. Open the local URL shown by Vite, usually:

```text
http://localhost:5173/
```

## If Port 5173 Is Busy

Run:

```bash
npm run dev -- --host 0.0.0.0 --port 5174
```

Then open:

```text
http://localhost:5174/
```

## Build Check

To confirm the project builds:

```bash
npm run build
```
