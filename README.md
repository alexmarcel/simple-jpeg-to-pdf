# ROSES PDF

ROSES PDF is a privacy-focused browser application for resizing, organizing, splitting, editing, and sharing PDF documents. Combine images and PDF files into one polished PDF, arrange pages, add text and image overlays, preview the result, and export without uploading document contents to an application server.

## Features

- Import multiple JPEG, PNG, and PDF files
- Combine images and multi-page PDFs
- Reorder, rotate, duplicate, delete, and grayscale pages
- Select multiple pages for batch actions
- Undo and redo up to 50 page-editing actions
- Switch between small, medium, and large thumbnail grids
- Inspect pages with full-screen zoom, pan, and keyboard navigation
- Add movable, resizable, and formatted multilingual text boxes
- Add optional text backgrounds and pick colors from the page
- Insert JPEG, PNG, or WebP image overlays
- Resize, layer, fade, grayscale, and directly crop inserted images
- Preserve transparent PNG pixels in previews and exported PDFs
- Export using original, A4, or US Letter page sizes
- Select orientation, margins, and export-quality presets
- Recover unfinished projects from private browser storage
- Use the responsive interface on desktop and mobile browsers
- Switch the complete interface between English and Bahasa Malaysia

## Privacy and architecture

Document processing happens locally in the browser:

- Files are decoded and rendered on the user's device.
- Editing state and recovery data are stored in IndexedDB and expire after 24 hours.
- Interface preferences are stored in localStorage.
- PDF generation and downloading happen entirely on the client.

The production deployment is a static website. Its host only serves HTML, CSS, JavaScript, and the PDF worker; it does not receive document uploads, generate PDFs, store projects, or manage accounts.

The interface currently requests its fonts from Google Fonts. Document contents are not included in those requests. Bundle fonts locally before deployment if a fully self-contained network profile is required.

Review the source and hosting configuration before using any web application for highly sensitive documents.

## Getting started

### Requirements

- A current Node.js release
- npm

### Local development

```sh
npm install
npm run dev
```

Open the local address printed by Vite.

## Deployment configuration

Public deployment settings live in one file: `src/app.config.ts`.

It controls:

- Application name
- English and Bahasa Malaysia taglines and browser descriptions
- First-visit language
- Default PDF filename, page size, orientation, margins, and quality
- Undo-history and viewer-rendering limits
- Import warning thresholds, hard file/page/pixel limits, and the total project byte limit

To change deployment settings:

1. Edit `src/app.config.ts`.
2. Run `npm run lint`, `npm run test`, and `npm run build`.
3. Redeploy the generated `dist/` directory.

Configuration changes do not modify an already deployed build; the application must be rebuilt and redeployed. The configuration is bundled into public browser JavaScript, so never place passwords, tokens, API keys, credentials, or other secrets in it. There is no runtime settings page, administrator login, backend, or database.

## Using ROSES PDF

1. Drop JPEG, PNG, or PDF files onto the import area, or select **Add files**.
2. Drag page cards to arrange the document.
3. Use page or batch controls to rotate, duplicate, remove, or apply grayscale.
4. Select the magnify button, or double-click a preview, to open the page viewer.
5. Use **Add text** to create and format text boxes.
6. Use **Insert image** to add JPEG, PNG, or WebP overlays.
7. Drag overlays to position them and use their contextual controls for resizing, cropping, opacity, grayscale, and layer ordering.
8. Choose the page size, orientation, margins, quality, and filename.
9. Select **Export PDF** to generate and download the document.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `+` / `-` | Zoom in or out |
| Left / Right arrow | Previous or next page |
| `R` | Rotate clockwise |
| `Esc` | Exit the active editor or close the viewer |
| `Ctrl/Cmd+Z` | Undo the last page edit |
| `Ctrl/Cmd+Shift+Z` | Redo the last page edit |

Crop mode additionally supports arrow-key panning, Shift+Arrow for larger movements, `+`/`-` for crop zoom, Enter to apply, and Escape to cancel.

## Development commands

```sh
npm run dev       # Start the development server
npm run lint      # Check the codebase
npm run test      # Run automated tests
npm run build     # Create a production build
```

Production files are generated in `dist/` and can be served by any static web host.

## Technology

- React and TypeScript
- Vite
- PDF.js for PDF rendering
- pdf-lib for PDF generation
- dnd-kit for accessible page ordering
- Lucide React for interface icons
- Canvas APIs for editing and export composition
- IndexedDB for local project recovery

## Current limitations

- DOC, DOCX, PPT, and PPTX imports are not supported.
- Password-protected or damaged PDFs may fail to import.
- Rotation, grayscale, or other raster edits can rasterize an imported PDF page during export.
- Text and image overlays remain visual layers rather than selectable PDF text or objects.
- Very large files and projects are constrained by available browser memory and storage.
- Imports warn at 100 MB or 500 PDF pages and reject files above 500 MB, PDFs above 2,000 pages, images above 100 megapixels, or projects above 1 GiB of unique source data.
- Viewer zoom changes only the preview and does not affect export quality.

## Roadmap

- Additional source-image formats
- Optional document and presentation conversion
- More overlay styling and image filters

## Contributing

Bug reports and focused pull requests are welcome. Before submitting a change, run:

```sh
npm run lint
npm run test
npm run build
```

Do not commit credentials, environment files, personal documents, or samples containing confidential or copyrighted information.
