export function BrandWordmark({ inverse = false }: { inverse?: boolean }) {
  return <span className={inverse ? "brand-wordmark inverse" : "brand-wordmark"} aria-label="FloatWatch">
    <span className="brand-float">Float</span>
    <svg className="brand-wave-w" viewBox="0 0 31 25" aria-hidden="true">
      <path d="M2.5 5.5c2.7 0 2.8 13.5 7 13.5s3.7-13.5 6.4-13.5S18 19 22.2 19s4.2-13.5 6.3-13.5" />
      <circle cx="28.5" cy="5.5" r="2" />
    </svg>
    <span className="brand-atch">atch</span>
  </span>;
}
