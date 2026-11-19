import { getCasDbPool, sql } from "@/hanjoo/lib/cas-db";
import type { SessionUser } from "@/hanjoo/lib/session";

type AuthOk = { ok: true; user: SessionUser };
type AuthFail = { ok: false; error: string };

/**
 * PMKSystem AuthDAO / sql-auth.xml 과 동일:
 * USER_MST + SHA1(HASHBYTES) + LOGIN_ERR_CNT + USER_AUTH
 */
export async function authenticateCas(
  userId: string,
  password: string,
): Promise<AuthOk | AuthFail> {
  const id = userId.trim();
  if (!id || !password) {
    return { ok: false, error: "아이디 또는 비밀번호를 입력하세요." };
  }

  const pool = await getCasDbPool();

  const exists = await pool
    .request()
    .input("userId", sql.VarChar(50), id)
    .query<{ n: number }>(
      `SELECT COUNT(*) AS n
         FROM dbo.USER_MST WITH (NOLOCK)
        WHERE USER_ID = @userId`,
    );
  if ((exists.recordset[0]?.n ?? 0) === 0) {
    return { ok: false, error: "아이디가 존재하지 않습니다." };
  }

  const errRow = await pool
    .request()
    .input("userId", sql.VarChar(50), id)
    .query<{ errCnt: number }>(
      `SELECT ISNULL(LOGIN_ERR_CNT, 0) AS errCnt
         FROM dbo.USER_MST WITH (NOLOCK)
        WHERE USER_ID = @userId`,
    );
  const errCnt = Number(errRow.recordset[0]?.errCnt ?? 0);
  if (errCnt > 4) {
    return {
      ok: false,
      error:
        "패스워드 5회 오류로 인해 계정이 잠겼습니다. 관리자에게 문의하세요.",
    };
  }

  const matched = await pool
    .request()
    .input("userId", sql.VarChar(50), id)
    .input("pw", sql.VarChar(100), password)
    .query<{ n: number }>(
      `SELECT COUNT(*) AS n
         FROM dbo.USER_MST WITH (NOLOCK)
        WHERE USER_ID = @userId
          AND PW = HASHBYTES('SHA1', CONVERT(varchar(100), @pw))`,
    );

  if ((matched.recordset[0]?.n ?? 0) === 0) {
    const next = errCnt + 1;
    await pool
      .request()
      .input("userId", sql.VarChar(50), id)
      .input("errCnt", sql.Int, next)
      .query(
        `UPDATE dbo.USER_MST
            SET UPD_DT = GETDATE(), LOGIN_ERR_CNT = @errCnt
          WHERE USER_ID = @userId`,
      );
    return {
      ok: false,
      error: `패스워드가 현재 ${next} 번 불일치 입니다. 5회 오류인 경우 계정이 잠깁니다.`,
    };
  }

  await pool
    .request()
    .input("userId", sql.VarChar(50), id)
    .input("errCnt", sql.Int, 0)
    .query(
      `UPDATE dbo.USER_MST
          SET UPD_DT = GETDATE(), LOGIN_ERR_CNT = @errCnt
        WHERE USER_ID = @userId`,
    );

  const session = await pool
    .request()
    .input("userId", sql.VarChar(50), id)
    .input("pw", sql.VarChar(100), password)
    .query<{
      userId: string;
      userName: string;
      custCd: string;
      groupId: string;
    }>(
      `SELECT TOP 1
              T1.USER_ID AS userId
            , T1.USER_NAME AS userName
            , T1.CUST_CD AS custCd
            , T2.AUTH_GRP_ID AS groupId
         FROM dbo.USER_MST T1
        INNER JOIN dbo.USER_AUTH T2 ON T1.USER_ID = T2.USER_ID
        WHERE T1.USER_ID = @userId
          AND T1.PW = HASHBYTES('SHA1', CONVERT(varchar(100), @pw))`,
    );

  const row = session.recordset[0];
  if (!row) {
    return { ok: false, error: "사용자 권한 정보가 없습니다." };
  }

  return {
    ok: true,
    user: {
      userId: String(row.userId),
      userName: String(row.userName || row.userId),
      custCd: String(row.custCd || ""),
      groupId: String(row.groupId || ""),
    },
  };
}
