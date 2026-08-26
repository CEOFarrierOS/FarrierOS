export default function BrandMark({ className = "" }: { className?: string }) {
  return <div aria-label="FarrierOS" className={`brand-mark ${className}`.trim()} role="img">
    <svg aria-hidden="true" className="brand-horseshoe" viewBox="0 0 24 24">
      <path d="M5.2 21.5c.5-3.5 1.8-6.1 4.2-7.8-1.3-2-1.7-4.6-.7-7.2L12 2l1.2 3.1 5.2-1.4-.9 5.1c1.7 1.8 2.3 4 1.6 6.3-.8 2.8-3.3 4.7-6.4 4.7H10l-.7 1.7H5.2Z" fill="currentColor" />
      <path d="M14.3 8.1c1.2.1 2.1.6 2.8 1.5-1.2.2-2.3 0-3.2-.6l.4-.9Z" fill="var(--surface)" />
      <circle cx="13.7" cy="7.1" r=".65" fill="var(--surface)" />
    </svg>
  </div>;
}
