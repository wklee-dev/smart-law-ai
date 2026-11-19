/** FTA 포털 · 원산지증명서 서식 */

export const FTA_ORIGIN_CERT_FORM_SOURCE_URL =
  "https://www.customs.go.kr/ftaportalkr/cm/cntnts/cntntsView.do?mi=3404&cntntsId=2776";

export const FTA_ORIGIN_CERT_FORM_DIR_DEFAULT =
  "C:/SQLiteDB/downloads/원산지증명서서식";

export type FtaOriginCertificateFormRow = {
  id: number;
  agreementCode: string;
  agreementName: string;
  title: string;
  fileName: string;
  fileSize: number;
  fileExists: boolean;
  previewUrl: string;
  downloadUrl: string;
  sortOrder: number;
};
