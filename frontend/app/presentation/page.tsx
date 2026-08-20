// 서버 컴포넌트. PresentationClient가 'use client'이므로 여기서 클라이언트 경계가 열린다.
import PresentationClient from './PresentationClient';

export default function PresentationPage() {
  return <PresentationClient />;
}
