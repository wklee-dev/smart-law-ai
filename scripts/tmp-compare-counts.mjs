import { listOpenlawLawsWithCrawlTargets } from "../app/lib/openlaw-sqlite-server.ts";
import { listGwanselawItemsFromDb } from "../app/lib/gwanselaw-list-server.ts";
import {
  filterApiCallList,
  prepareApiManagementList,
} from "../app/shared/api-management-list.ts";
import { normalizeLawIdForStorage } from "../app/shared/law-id.ts";
import { listOpenlawApiStatus } from "../app/lib/openlawapi-server.ts";

const { laws, crawlTargets } = listOpenlawLawsWithCrawlTargets();
const gwan = prepareApiManagementList(listGwanselawItemsFromDb());
const apiCall = filterApiCallList(gwan);
const status = listOpenlawApiStatus();

const openlawById = new Map();
for (const l of laws) {
  const id = normalizeLawIdForStorage(l.lawId);
  if (id) openlawById.set(id, l);
}

const gwanById = new Map();
for (const i of apiCall) {
  const id = normalizeLawIdForStorage(i.lawId);
  if (id) gwanById.set(id, i);
}

const inOpenlawNotGwan = laws.filter((l) => {
  const id = normalizeLawIdForStorage(l.lawId);
  if (id) return !gwanById.has(id);
  return !apiCall.some((g) => g.apiName.trim() === l.lawName.trim());
});

console.log("openlaw list:", laws.length);
console.log("openlaw collected:", laws.filter((l) => l.hasBody).length);
console.log("crawl excel allowed:", crawlTargets?.allowedRows);
console.log("api-call register:", apiCall.length);
console.log(
  "api-call processed (status):",
  status.filter((s) => s.bodySaved).length,
);

console.log("\nIn OPEN API list but not api-call register:");
for (const l of inOpenlawNotGwan) {
  console.log(`  ${l.lawName} | id=${l.lawId} | body=${l.hasBody ? "Y" : "N"}`);
}

const efydExtra = [...openlawById.keys()].filter((id) => gwanById.has(id) === false);
console.log("\nopenlaw_efyd in DB but missing from api-call by law_id:", efydExtra.length);

const processedGwan = apiCall.filter(
  (i) => status.find((s) => s.gwanselawId === i.id)?.bodySaved,
);
const processedOpenlaw = laws.filter((l) => l.hasBody);
console.log("\nProcessed gap names in openlaw not counted in api-call:");
for (const l of processedOpenlaw) {
  const id = normalizeLawIdForStorage(l.lawId);
  const g = id ? gwanById.get(id) : undefined;
  if (!g) {
    console.log(`  missing row: ${l.lawName} ${l.lawId}`);
    continue;
  }
  const s = status.find((x) => x.gwanselawId === g.id);
  if (!s?.bodySaved) {
    console.log(`  has body but status false: ${l.lawName} gwanId=${g.id} lawId=${id}`);
  }
}
