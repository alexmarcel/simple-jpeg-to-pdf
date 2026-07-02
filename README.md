# Pagecraft

Pagecraft is a privacy-friendly browser app for combining images and PDF files into a single, polished PDF. Import multiple files, arrange and edit their pages, preview them in detail, and export the finished document without uploading its contents to a server.

## Features

- Import multiple JPEG, PNG, and PDF files at once
- Mix images and multi-page PDFs in one document
- Reorder pages with drag and drop
- Rotate, duplicate, remove, and convert pages to grayscale
- Inspect pages in a full-screen viewer with zoom, pan, and keyboard navigation
- Export using original, A4, or US Letter page sizes
- Select automatic, portrait, or landscape orientation
- Choose margin and quality presets
- Preserve unedited PDF pages when exporting at their original size
- Responsive interface for desktop and mobile browsers

## Privacy

Supported files are processed locally in the browser. Pagecraft does not require an account or upload document contents to an application server.

As with any web application, review the code and hosting configuration before using it for highly sensitive documents.

## Getting started

### Requirements

- A current Node.js release
- npm

### Installation

```sh
git clone <repository-url>
cd simple-jpeg-to-pdf
npm install
npm run dev
```

Open the local address printed by Vite in your browser.

## Using Pagecraft

1. Drop JPEG, PNG, or PDF files onto the import area, or select **Add files**.
2. Drag page cards to arrange the document.
3. Use the page controls to rotate, duplicate, remove, or apply grayscale.
4. Select the magnify button—or double-click a preview—to open the full-page viewer.
5. Choose the page size, orientation, margins, export quality, and filename.
6. Select **Export PDF** to generate and download the document.

### Viewer shortcuts

| Key | Action |
| --- | --- |
| `+` / `-` | Zoom in or out |
| `←` / `→` | Previous or next page |
| `R` | Rotate clockwise |
| `Esc` | Close the viewer |

## Development

```sh
npm run dev       # Start the development server
npm run lint      # Check the codebase
npm run build     # Create a production build
npm run test      # Run automated tests
```

Production files are generated in `dist/` and can be served by any static web host.

## Technology

- React and TypeScript
- Vite
- PDF.js for PDF rendering
- pdf-lib for PDF generation
- dnd-kit for accessible page ordering

## Current limitations

- DOC, DOCX, PPT, and PPTX imports are not currently supported.
- Password-protected or damaged PDFs may fail to import.
- Editing a PDF page requires rasterizing that page during export.
- Very large files are constrained by the memory available to the browser.
- Viewer zoom changes only the preview and does not affect export quality.

## Roadmap

- Crop controls
- Batch page actions
- Undo and redo
- Project recovery
- Additional image formats
- Optional document and presentation conversion

## Contributing

Bug reports and focused pull requests are welcome. Before submitting a change, run:

```sh
npm run lint
npm run build
```

Please avoid committing document samples that contain personal, confidential, or copyrighted information.
