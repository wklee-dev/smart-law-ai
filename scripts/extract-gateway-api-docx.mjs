import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const zip =
  "D:/HJCustoms/프로젝트/01.진행중/19.HanjooGatewayAPI/운영/HanjooGatewayAPI_API목록 V1.0.docx";
const tmp = path.join(process.cwd(), "scripts/_gw-api-docx");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execSync(`tar -xf "${zip}" -C "${tmp}"`, { stdio: "inherit" });
const xml = fs.readFileSync(path.join(tmp, "word/document.xml"), "utf8");
const text = xml
  .replace(/<w:tab[^/]*\/>/g, "\t")
  .replace(/<\/w:p>/g, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");
const out = path.join(process.cwd(), "scripts/_gw-api-doc.txt");
fs.writeFileSync(out, text, "utf8");
console.log("Written", out);
console.log(text.slice(0, 12000));
