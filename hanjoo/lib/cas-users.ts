import { getCasDbPool } from "@/hanjoo/lib/cas-db";

export type CasUser = {
  userId: string;
  userName: string;
  deptName: string;
  position: string;
};

/** 관리자 등록 대상: 한주(CUST_CD='0000') 사용 중(DEL_YN='N') 사용자 */
export async function listCasStaffUsers(): Promise<CasUser[]> {
  const pool = await getCasDbPool();
  const res = await pool.request().query<{
    userId: string;
    userName: string | null;
    deptName: string | null;
    position: string | null;
  }>(
    `SELECT U.USER_ID AS userId
          , U.USER_NAME AS userName
          , ISNULL(D.DEPT_NM, '') AS deptName
          , COALESCE(NULLIF(P.POSN_NM, ''), U.DSGN, '') AS position
       FROM dbo.USER_MST U WITH (NOLOCK)
      OUTER APPLY (
            SELECT TOP 1 DEPT_NM
              FROM dbo.DEPARTMENT WITH (NOLOCK)
             WHERE DEPT_CD = U.DEPT_CD
          ) D
      OUTER APPLY (
            SELECT TOP 1 POSN_NM
              FROM dbo.position WITH (NOLOCK)
             WHERE POSN_CD = U.POSN_CD
               AND GUBN_CD = 'P'
          ) P
      WHERE U.CUST_CD = '0000'
        AND U.DEL_YN = 'N'
      ORDER BY deptName, U.USER_NAME, U.USER_ID`,
  );
  return res.recordset.map((r) => ({
    userId: String(r.userId ?? "").trim(),
    userName: String(r.userName ?? "").trim(),
    deptName: String(r.deptName ?? "").trim(),
    position: String(r.position ?? "").trim(),
  }));
}
