// 단독 운영 덱이라 호스트 UI 숨김 없이 폰트만 로드한다. (INDEX §11-5)
export default function PresentationLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
      />
      {children}
    </>
  );
}
