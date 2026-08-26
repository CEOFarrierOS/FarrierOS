export default function BrandMark({ className = "" }: { className?: string }) {
  return <div aria-label="FarrierOS" className={`brand-mark ${className}`.trim()} role="img">
    <svg aria-hidden="true" className="brand-horseshoe" viewBox="0 0 24 24">
      <path d="M3 22h8.7l1.2-3.6c1.8.7 4 .5 5.6-.6l3.3-2.2c1-.7 1.3-2 .6-3l-1.3-1.9c-.5-.7-1.2-1.2-2-1.5l-2.7-.9-.8-5.4-3.5 4.5-2.7 1.4C6.4 11.8 4.3 16.4 3 22Z" fill="currentColor" />
      <path d="m9.5 8.8 1.5 1-1.4 1.1 1.2 1-1.7 1.1 1.1 1.1-1.8 1.2.3 4.4H4.2c1.2-4.8 3-8.4 5.3-10.9Z" fill="var(--surface)" opacity=".32" />
      <path d="m14.8 4.9-1.7 2.3 2.1-.7Z" fill="var(--surface)" opacity=".42" />
      <circle cx="16.1" cy="9.7" r=".52" fill="var(--surface)" />
      <circle cx="20.7" cy="13.7" r=".4" fill="var(--surface)" />
    </svg>
  </div>;
}
