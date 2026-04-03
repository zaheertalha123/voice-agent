/** App mark — uses `public/ai-voice.png` (styled via `.app-logo` for dark theme). */
export function AppLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/ai-voice.png"
      alt=""
      className={['app-logo', className].filter(Boolean).join(' ')}
      width={48}
      height={48}
      decoding="async"
    />
  );
}
