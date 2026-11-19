import fs from "node:fs";

/** `C:/...` 경로가 없으면 같은 경로의 `D:/...`(개발 PC)를 쓴다. 둘 다 없으면 C 경로 그대로. */
export function preferCDrive(cPath: string): string {
  if (fs.existsSync(cPath)) return cPath;
  const dPath = cPath.replace(/^[Cc]:/, "D:");
  return fs.existsSync(dPath) ? dPath : cPath;
}
