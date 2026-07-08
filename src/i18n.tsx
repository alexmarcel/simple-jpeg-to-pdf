/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import appConfig from './app.config'

export type Locale = 'en' | 'ms-MY'
type Variables = Record<string, string | number>

const en = {
  private: 'Private by design', filesStay: 'Files stay on this device', language: 'Language', pdfMaker: 'PDF maker', undo: 'Undo', redo: 'Redo', clear: 'Clear', addFiles: 'Add files',
  dropAnywhere: 'Drop your files anywhere', yourDocument: 'Your document', arrangePages: 'Arrange your pages', buildPdf: 'Build a PDF, beautifully.',
  arrangeHelp: 'Select, edit, and drag pages into place.', emptyHelp: 'Bring images and PDFs together. Nothing gets uploaded.', page: 'page', pages: 'pages',
  selectAll: 'Select all', clearSelection: 'Clear selection', selected: '{count} selected', selectBatch: 'Select pages for batch actions', rotate: 'Rotate', grayscale: 'Grayscale', duplicate: 'Duplicate', delete: 'Delete',
  smallThumbs: 'Small thumbnails', mediumThumbs: 'Medium thumbnails', largeThumbs: 'Large thumbnails', dropFiles: 'Drop files here', chooseDevice: 'or click to choose from your device', formats: 'JPEG · PNG · PDF — multiple files welcome', addMore: 'Add more',
  exportSettings: 'Export settings', makeItYours: 'Make it yours', pageSize: 'Page size', fitEach: 'Fit each page', a4: 'A4 paper', letter: 'US Letter', orientation: 'Orientation', auto: 'Auto', portrait: 'Portrait', landscape: 'Landscape', margins: 'Margins', none: 'None', narrow: 'Narrow', normal: 'Normal', exportQuality: 'Export quality', small: 'Small', balanced: 'Balanced', best: 'Best', emailSharing: 'Email & quick sharing', everyday: 'Everyday quality', printArchive: 'Print & archive', recommended: 'Recommended', fileName: 'File name', exportPdf: 'Export PDF', processedLocally: 'Processed entirely in your browser', estimated: '{size} MB est.',
  recovery: 'Project recovery', pickUp: 'Pick up where you left off?', recoveryFound: 'We found {count} saved {pages} from {date}.', discard: 'Discard', restoreProject: 'Restore project',
  deletedOne: '1 page deleted', deletedMany: '{count} pages deleted', dismiss: 'Dismiss', footer: 'No uploads. No accounts. No funny business.', footerNote: 'Made for documents that should stay yours.',
  readingOne: 'Reading 1 file…', readingMany: 'Reading {count} files…', preparing: 'Preparing page {done} of {total}', restoring: 'Restoring your project…',
  recoveryUnavailable: 'Project recovery is unavailable in this browser.', recoverySaveFailed: 'Your project could not be saved for recovery. Browser storage may be full.', recoveryRestoreFailed: 'The saved project could not be restored.', exportFailed: 'The PDF could not be created.', unsupportedFile: '{name}: unsupported format', unreadableFile: '{name}: could not be read', removeEveryPage: 'Remove every page?',
  selectPage: 'Select page {number}', reorderPage: 'Reorder page {number}', openFull: 'Open full view of {name}', openFullTitle: 'Open full view', rotateClockwise: 'Rotate clockwise', toggleGrayscale: 'Toggle grayscale', duplicatePage: 'Duplicate page', removePage: 'Remove page', pdfPage: 'PDF · page {number}', thumbnailSize: 'Thumbnail size',
  fullView: 'Full view of {name}', pageOf: 'Page {current} of {total}', sourcePage: 'source page {number}', zoomControls: 'Zoom controls', zoomOut: 'Zoom out', zoomIn: 'Zoom in', zoomPercent: 'Zoom {percent} percent', fit: 'Fit', closeViewer: 'Close full-page viewer', rendering: 'Rendering high-resolution page…', previousPage: 'Previous page', nextPage: 'Next page', deletePage: 'Delete page', addText: 'Add text', insertImage: 'Insert image',
  moveImage: 'Move inserted image', resizeImage: 'Resize inserted image', resizeCrop: 'Resize free crop frame', moveText: 'Move text', textContent: 'Text content', typeHere: 'Type here', resizeText: 'Resize text box',
  fontFamily: 'Font family', sans: 'Sans', serif: 'Serif', mono: 'Mono', size: 'Size', textColor: 'Text color', backgroundColor: 'Background color', pickColor: 'Pick background color from page', pickColorTitle: 'Pick color from page', opacity: 'Opacity', removeBackground: 'Remove background', noBackground: 'No background', bold: 'Bold', italic: 'Italic', alignLeft: 'Align left', alignCenter: 'Align center', alignRight: 'Align right', duplicateText: 'Duplicate text', deleteText: 'Delete text',
  crop: 'Crop', resetCrop: 'Reset crop', moveBackward: 'Move backward', moveForward: 'Move forward', original: 'Original', free: 'Free', square: '1:1', zoom: 'Zoom', reset: 'Reset', cancel: 'Cancel', apply: 'Apply',
} as const

const ms: Record<keyof typeof en, string> = {
  private: 'Privasi terbina dalam', filesStay: 'Fail kekal pada peranti ini', language: 'Bahasa', pdfMaker: 'Pembina PDF', undo: 'Buat asal', redo: 'Buat semula', clear: 'Kosongkan', addFiles: 'Tambah fail',
  dropAnywhere: 'Lepaskan fail anda di mana-mana', yourDocument: 'Dokumen anda', arrangePages: 'Susun halaman anda', buildPdf: 'Bina PDF dengan mudah.',
  arrangeHelp: 'Pilih, sunting dan seret halaman ke tempatnya.', emptyHelp: 'Gabungkan imej dan PDF. Tiada apa-apa dimuat naik.', page: 'halaman', pages: 'halaman',
  selectAll: 'Pilih semua', clearSelection: 'Kosongkan pilihan', selected: '{count} dipilih', selectBatch: 'Pilih halaman untuk tindakan pukal', rotate: 'Putar', grayscale: 'Skala kelabu', duplicate: 'Duplikasi', delete: 'Padam',
  smallThumbs: 'Thumbnail kecil', mediumThumbs: 'Thumbnail sederhana', largeThumbs: 'Thumbnail besar', dropFiles: 'Lepaskan fail di sini', chooseDevice: 'atau klik untuk memilih daripada peranti', formats: 'JPEG · PNG · PDF — berbilang fail diterima', addMore: 'Tambah lagi',
  exportSettings: 'Tetapan eksport', makeItYours: 'Sesuaikan hasil anda', pageSize: 'Saiz halaman', fitEach: 'Muat setiap halaman', a4: 'Kertas A4', letter: 'US Letter', orientation: 'Orientasi', auto: 'Auto', portrait: 'Potret', landscape: 'Landskap', margins: 'Margin', none: 'Tiada', narrow: 'Sempit', normal: 'Biasa', exportQuality: 'Kualiti eksport', small: 'Kecil', balanced: 'Seimbang', best: 'Terbaik', emailSharing: 'E-mel & perkongsian pantas', everyday: 'Kualiti harian', printArchive: 'Cetak & arkib', recommended: 'Disyorkan', fileName: 'Nama fail', exportPdf: 'Eksport PDF', processedLocally: 'Diproses sepenuhnya dalam pelayar anda', estimated: 'anggaran {size} MB',
  recovery: 'Pemulihan projek', pickUp: 'Sambung kerja anda?', recoveryFound: 'Kami menemui {count} {pages} tersimpan dari {date}.', discard: 'Buang', restoreProject: 'Pulihkan projek',
  deletedOne: '1 halaman dipadam', deletedMany: '{count} halaman dipadam', dismiss: 'Tutup', footer: 'Tiada muat naik. Tiada akaun. Tiada helah.', footerNote: 'Dibina untuk dokumen yang patut kekal milik anda.',
  readingOne: 'Membaca 1 fail…', readingMany: 'Membaca {count} fail…', preparing: 'Menyediakan halaman {done} daripada {total}', restoring: 'Memulihkan projek anda…',
  recoveryUnavailable: 'Pemulihan projek tidak tersedia dalam pelayar ini.', recoverySaveFailed: 'Projek anda tidak dapat disimpan untuk pemulihan. Storan pelayar mungkin penuh.', recoveryRestoreFailed: 'Projek tersimpan tidak dapat dipulihkan.', exportFailed: 'PDF tidak dapat dijana.', unsupportedFile: '{name}: format tidak disokong', unreadableFile: '{name}: tidak dapat dibaca', removeEveryPage: 'Buang semua halaman?',
  selectPage: 'Pilih halaman {number}', reorderPage: 'Susun semula halaman {number}', openFull: 'Buka paparan penuh {name}', openFullTitle: 'Buka paparan penuh', rotateClockwise: 'Putar mengikut arah jam', toggleGrayscale: 'Togol skala kelabu', duplicatePage: 'Duplikasi halaman', removePage: 'Buang halaman', pdfPage: 'PDF · halaman {number}', thumbnailSize: 'Saiz thumbnail',
  fullView: 'Paparan penuh {name}', pageOf: 'Halaman {current} daripada {total}', sourcePage: 'halaman sumber {number}', zoomControls: 'Kawalan zoom', zoomOut: 'Zum keluar', zoomIn: 'Zum masuk', zoomPercent: 'Zum {percent} peratus', fit: 'Muat', closeViewer: 'Tutup paparan halaman penuh', rendering: 'Memaparkan halaman resolusi tinggi…', previousPage: 'Halaman sebelumnya', nextPage: 'Halaman seterusnya', deletePage: 'Padam halaman', addText: 'Tambah teks', insertImage: 'Sisip imej',
  moveImage: 'Alih imej sisipan', resizeImage: 'Ubah saiz imej sisipan', resizeCrop: 'Ubah saiz bingkai potong bebas', moveText: 'Alih teks', textContent: 'Kandungan teks', typeHere: 'Taip di sini', resizeText: 'Ubah saiz kotak teks',
  fontFamily: 'Jenis fon', sans: 'Sans', serif: 'Serif', mono: 'Mono', size: 'Saiz', textColor: 'Warna teks', backgroundColor: 'Warna latar', pickColor: 'Pilih warna latar daripada halaman', pickColorTitle: 'Pilih warna daripada halaman', opacity: 'Kelegapan', removeBackground: 'Buang latar', noBackground: 'Tiada latar', bold: 'Tebal', italic: 'Italik', alignLeft: 'Jajar kiri', alignCenter: 'Jajar tengah', alignRight: 'Jajar kanan', duplicateText: 'Duplikasi teks', deleteText: 'Padam teks',
  crop: 'Potong', resetCrop: 'Tetapkan semula potongan', moveBackward: 'Alih ke belakang', moveForward: 'Alih ke hadapan', original: 'Asal', free: 'Bebas', square: '1:1', zoom: 'Zum', reset: 'Tetapkan semula', cancel: 'Batal', apply: 'Terapkan',
}

export type TranslationKey = keyof typeof en
const dictionaries = { en, 'ms-MY': ms }
export const translations = dictionaries
export function translate(locale: Locale, key: TranslationKey, variables: Variables = {}) { let result: string = dictionaries[locale][key] ?? en[key]; for (const [name, value] of Object.entries(variables)) result = result.replaceAll(`{${name}}`, String(value)); return result }
interface I18nValue { locale: Locale; setLocale: (locale: Locale) => void; t: (key: TranslationKey, variables?: Variables) => string; formatDate: (date: Date) => string }
const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => { try { const saved = localStorage.getItem('pagecraft-locale'); return saved === 'en' || saved === 'ms-MY' ? saved : appConfig.defaultLocale } catch { return appConfig.defaultLocale } })
  useEffect(() => { document.documentElement.lang = locale; try { localStorage.setItem('pagecraft-locale', locale) } catch { /* Language persistence is optional. */ } }, [locale])
  const value = useMemo<I18nValue>(() => ({ locale, setLocale: setLocaleState, t: (key, variables = {}) => translate(locale, key, variables), formatDate: date => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date) }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() { const value = useContext(I18nContext); if (!value) throw new Error('I18nProvider is missing'); return value }
export const translationKeys = Object.keys(en)
