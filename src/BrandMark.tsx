export default function BrandMark({ className = "" }: { className?: string }) {
  return <div aria-label="FarrierOS" className={`brand-mark ${className}`.trim()} role="img">
    <svg aria-hidden="true" className="brand-horseshoe" fill="none" viewBox="0 0 24 24">
      <path d="M5 4v7.5a7 7 0 0 0 14 0V4h-4v7.5a3 3 0 0 1-6 0V4H5Z" fill="currentColor" />
      <circle cx="7" cy="6.4" r=".8" fill="var(--surface)" />
      <circle cx="17" cy="6.4" r=".8" fill="var(--surface)" />
      <circle cx="7.1" cy="10" r=".8" fill="var(--surface)" />
      <circle cx="16.9" cy="10" r=".8" fill="var(--surface)" />
    </svg>
  </div>;
}
