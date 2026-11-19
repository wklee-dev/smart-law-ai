import { getSessionUser } from "@/hanjoo/lib/session";
import { redirect } from "next/navigation";
import "./portal.css";

export const dynamic = "force-dynamic";

/** 관리자 로그인 후 화면 선택 (Hanjoo 포털 / smart-law-ai 관리자) */
export default async function PortalSelectPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");

  return (
    <div className="portal-select">
      <div className="portal-select-inner">
        <h1>화면 선택</h1>
        <p className="portal-select-sub">{user.userName} 님, 이용할 화면을 선택하세요.</p>
        <div className="portal-select-cards">
          {/* 루트 레이아웃이 달라 <a> 로 전체 이동 */}
          <a href="/" className="portal-card">
            <strong>Smart-Law-Hanjoo</strong>
            <span>한주 HS 및 법령정보포털 (일반 사용자 화면)</span>
          </a>
          <a href="/ai" className="portal-card portal-card-admin">
            <strong>smart-law-ai 관리자</strong>
            <span>수집·API·크롤러 관리 및 원천 데이터 조회</span>
          </a>
        </div>
        <form action="/api/auth/logout" method="post" className="portal-select-logout">
          <button type="submit">로그아웃</button>
        </form>
      </div>
    </div>
  );
}
